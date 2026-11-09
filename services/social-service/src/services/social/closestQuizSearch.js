import { buildClosestSearch } from '../closestSearch.js';

export function closestQuizSearch(query, uploaderIds = []) {
  const plan = buildClosestSearch(query, { primary: 'title', fields: ['category'], arrays: ['tags'], wordFields: ['description'] });
  if (uploaderIds.length) plan.filter.$or.push({ uploader: { $in: uploaderIds } });
  return plan;
}
