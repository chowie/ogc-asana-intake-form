import roster from '../../data/roster.json'

export const STAFF = roster

export function findStaff(name) {
  return STAFF.find((s) => s.name === name) ?? null
}
