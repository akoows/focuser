'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Amizades', { skip: h.skip }, () => {
  let app;
  let alice;
  let bob;
  let carol;

  before(async () => {
    app = h.loadApp();
    [alice, bob, carol] = await Promise.all([
      h.signup(app, 'friend-alice'),
      h.signup(app, 'friend-bob'),
      h.signup(app, 'friend-carol'),
    ]);
  });
  after(h.closeDb);

  it('envia, aceita e remove uma amizade com dados mínimos de perfil', async () => {
    const request = await alice.agent.post('/api/friends/requests').set(h.H).send({ username: bob.user.username });
    assert.equal(request.status, 201);
    assert.equal(request.body.data.relationship.status, 'SENT');

    const sentStatus = await alice.agent.get(`/api/friends/status/${bob.user.username}`);
    assert.equal(sentStatus.body.data.relationship.status, 'SENT');

    const incoming = await bob.agent.get('/api/friends').set(h.H);
    assert.equal(incoming.status, 200);
    assert.equal(incoming.body.data.incomingRequests.length, 1);
    assert.equal(incoming.body.data.incomingRequests[0].username, alice.user.username);
    assert.equal(Object.hasOwn(incoming.body.data.incomingRequests[0], 'email'), false);

    const accept = await bob.agent.post(`/api/friends/requests/${request.body.data.relationship.requestId}/accept`).set(h.H).send({});
    assert.equal(accept.status, 200);
    assert.equal((await alice.agent.get(`/api/friends/status/${bob.user.username}`)).body.data.relationship.status, 'FRIENDS');
    assert.equal((await alice.agent.get('/api/friends')).body.data.friends[0].username, bob.user.username);

    const removed = await alice.agent.delete(`/api/friends/${bob.user.id}`).set(h.H).send({});
    assert.equal(removed.status, 200);
    assert.equal((await bob.agent.get(`/api/friends/status/${alice.user.username}`)).body.data.relationship.status, 'NONE');
  });

  it('permite cancelar e recusar pedidos, e impede autoamizade e pedidos duplicados', async () => {
    const self = await alice.agent.post('/api/friends/requests').set(h.H).send({ username: alice.user.username });
    assert.equal(self.status, 400);
    assert.equal(self.body.error.code, 'FRIEND_REQUEST_SELF');

    const sent = await alice.agent.post('/api/friends/requests').set(h.H).send({ username: carol.user.username });
    const duplicate = await alice.agent.post('/api/friends/requests').set(h.H).send({ username: carol.user.username });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'FRIEND_REQUEST_ALREADY_SENT');

    const canceled = await alice.agent.delete(`/api/friends/requests/${sent.body.data.relationship.requestId}`).set(h.H).send({});
    assert.equal(canceled.status, 200);

    const incoming = await carol.agent.post('/api/friends/requests').set(h.H).send({ username: alice.user.username });
    const strangerAccept = await bob.agent.post(`/api/friends/requests/${incoming.body.data.relationship.requestId}/accept`).set(h.H).send({});
    assert.equal(strangerAccept.status, 404);

    const declined = await alice.agent.delete(`/api/friends/requests/${incoming.body.data.relationship.requestId}`).set(h.H).send({});
    assert.equal(declined.status, 200);
    assert.equal((await carol.agent.get(`/api/friends/status/${alice.user.username}`)).body.data.relationship.status, 'NONE');
  });

  it('exige autenticação e valida usernames e IDs de pedidos', async () => {
    assert.equal((await h.request(app).get('/api/friends')).status, 401);
    assert.equal((await alice.agent.get('/api/friends/status/x')).status, 400);
    assert.equal((await alice.agent.post('/api/friends/requests').set(h.H).send({ username: 'missing.user' })).status, 404);
    assert.equal((await alice.agent.post('/api/friends/requests/not-an-id/accept').set(h.H).send({})).status, 400);
  });
});
