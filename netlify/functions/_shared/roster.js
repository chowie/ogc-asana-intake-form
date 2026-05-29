import roster from '../../../data/roster.json' with { type: 'json' }

// Set of Asana GIDs that belong to the deacon roster. Used to reject
// arbitrary workspace GIDs supplied as follower/assignee on a task.
export const validGids = new Set(roster.map((s) => s.asanaGid).filter(Boolean))

export function isValidGid(gid) {
  return validGids.has(gid)
}
