export async function recoverGoalConflict(requestError, reloadLatestGoals, setError, guidance) {
  if (requestError?.code !== 'GOAL_CHANGED') return false;

  const reloaded = await reloadLatestGoals();
  if (reloaded) setError(guidance);
  return true;
}
