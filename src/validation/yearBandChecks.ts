import { CurriculumEdge, CurriculumNode, ValidationIssue } from "../schema/zodSchemas.js";

function minYear(yearBand?: string): number | null {
  if (!yearBand) return null;
  if (/^F/i.test(yearBand)) return 0;
  const match = yearBand.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function checkYearBandDirection(edge: CurriculumEdge, from?: CurriculumNode, to?: CurriculumNode): ValidationIssue[] {
  if (edge.type !== "requires") return [];
  const fromYear = minYear(from?.year_band);
  const toYear = minYear(to?.year_band);
  if (fromYear === null || toYear === null) return [];
  if (toYear - fromYear >= 3) {
    return [{ code: "suspicious_year_band_direction", severity: "warning", edge_id: edge.id, message: `${edge.from} requires a much later-looking prerequisite ${edge.to}` }];
  }
  return [];
}
