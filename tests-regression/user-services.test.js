import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma.js';
import { userCreate } from '../src/services/User/userCreate.js';
import { userEdit } from '../src/services/User/userEdit.js';
import { userLogin } from '../src/services/User/userLogin.js';
import { userPerID } from '../src/services/User/userPerID.js';
import { userList } from '../src/services/User/userList.js';
import { userDelete } from '../src/services/User/userDelete.js';
import { createAuthToken } from '../src/middlewares/auth.js';

function mockUser(t, method, implementation) {
    const previous = prisma.user[method];
    prisma.user[method] = t.mock.fn(implementation);
    t.after(() => { prisma.user[method] = previous; });
    return prisma.user[method];
}
const account = { id: 'user-1', name: 'Maria', email: 'maria@example.com', tokenVersion: 7, pass: 'private', resetToken: 'secret' };
function safe(result) {
    assert.equal(result.id, account.id);
    for (const key of ['pass', 'password', 'tokenVersion', 'resetToken']) assert.equal(Object.hasOwn(result, key), false);
}
function cost(t) { const previous = process.env.BCRYPT_COST; process.env.BCRYPT_COST = '4'; t.after(() => { if (previous === undefined) delete process.env.BCRYPT_COST; else process.env.BCRYPT_COST = previous; }); }

test('create hashes the password, restricts persisted fields and sanitizes the response', async t => {
    cost(t);
    mockUser(t, 'create', async ({data}) => {
        assert.deepEqual(Object.keys(data).sort(), ['email','name','pass']);
        assert.notEqual(data.pass, 'password-123');
        assert.equal(await bcrypt.compare('password-123', data.pass), true);
        assert.equal(bcrypt.getRounds(data.pass), 4);
        return {...account, ...data};
    });
    safe(await userCreate({...account, pass:'password-123', admin:true}));
});
test('edit hashes a new password and preserves omitted credentials', async t => {
    cost(t); const pass = await bcrypt.hash('original', 4);
    mockUser(t, 'findUnique', async () => ({...account, pass}));
    const writes=[];
    mockUser(t, 'update', async args => { writes.push(args); return {...account,...args.data}; });
    safe(await userEdit(account.id, {}));
    assert.equal(writes[0].data.pass, pass);
    safe(await userEdit(account.id, {pass:'replacement',email:'new@example.com'}));
    assert.equal(await bcrypt.compare('replacement',writes[1].data.pass),true);
    assert.deepEqual(writes[1].where,{id:account.id});
});
for (const data of [{email:123},{pass:123}]) test(`edit rejects invalid fields ${JSON.stringify(data)}`, async t => {
    mockUser(t,'findUnique',async()=>account);
    const update=mockUser(t,'update',async()=>assert.fail('must not write'));
    await assert.rejects(userEdit(account.id,data)); assert.equal(update.mock.callCount(),0);
});
test('edit rejects a missing user', async t=>{mockUser(t,'findUnique',async()=>null); await assert.rejects(userEdit('missing',{}));});
test('login verifies bcrypt and removes private fields',async t=>{
    mockUser(t,'findUnique',async({where})=>{assert.deepEqual(where,{email:account.email});return {...account,pass:await bcrypt.hash('correct',4)};});
    safe(await userLogin({email:account.email,pass:'correct'}));
    await assert.rejects(userLogin({email:account.email,pass:'wrong'}), error=>{assert.ok(error.cause);return true;});
});
test('missing accounts fail login and lookup',async t=>{mockUser(t,'findUnique',async()=>null);await assert.rejects(userLogin({email:account.email,pass:'wrong'}));await assert.rejects(userPerID('missing'));});
for(const [name,method,invoke] of [['lookup','findUnique',()=>userPerID(account.id)],['list','findMany',userList],['delete','delete',()=>userDelete(account.id)]]) {
    test(`${name} sanitizes every returned account`,async t=>{mockUser(t,method,async args=>{if(method!=='findMany')assert.deepEqual(args.where,{id:account.id});return method==='findMany'?[account]:account;});const result=await invoke();if(Array.isArray(result))result.forEach(safe);else safe(result);});
}
for(const [name,method,invoke] of [['create','create',()=>userCreate({name:'Maria',email:account.email,pass:'valid-pass'})],['edit','findUnique',()=>userEdit(account.id,{})],['login','findUnique',()=>userLogin({email:account.email,pass:'valid-pass'})],['lookup','findUnique',()=>userPerID(account.id)],['list','findMany',userList],['delete','delete',()=>userDelete(account.id)]]) test(`${name} wraps database failures with their cause`,async t=>{
    cost(t);const failure=new Error('database internal secret');mockUser(t,method,async()=>{throw failure;});
    await assert.rejects(invoke(),error=>{assert.equal(error.cause,failure);assert.doesNotMatch(error.message,/internal secret/);return true;});
});
test('JWT preserves the explicit tokenVersion claim',t=>{
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='regression-secret-at-least-thirty-two-characters';t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
    for(const version of [0,7]) assert.equal(jwt.verify(createAuthToken({...account,tokenVersion:version}),process.env.JWT_SECRET).tokenVersion,version);

});


test('revoked tokenVersion cannot authenticate after a password/session change',async t=>{
    const {optionalAuth}=await import('../src/middlewares/auth.js');
    const old=process.env.JWT_SECRET;process.env.JWT_SECRET='regression-secret-at-least-thirty-two-characters';t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
    mockUser(t,'findUnique',async()=>account);
    assert.equal(await optionalAuth({cookies:{focuser_token:createAuthToken({...account,tokenVersion:6})}}),null);
    assert.equal((await optionalAuth({cookies:{focuser_token:createAuthToken(account)}})).id,account.id);
    assert.equal(await optionalAuth({cookies:{focuser_token:'tampered'}}),null);
});
