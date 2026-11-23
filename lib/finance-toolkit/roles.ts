// filepath: lib/finance-toolkit/roles.ts

/**
 * Provisional role groups and seniority levels, read from the Maconomy role
 * titles (EmployeeCategoryName). Maconomy has no department field, so until the
 * talent team's mapping table (person → department → media type) is ready, the
 * Staffing tab groups titles by the function and level their names state.
 *
 * Groups follow the talent team's department list where a title clearly belongs
 * to one (Planning, Investments, Digital Activation, Insights, Media
 * Operations, Business Leadership). "Media team" holds the cross-channel media
 * titles (supervisor, manager, director) whose department the title alone
 * doesn't say. Replace this file's rules with the mapping table when it lands.
 */

export type RoleGroup =
  "Planning" | "Investments" | "Digital Activation" | "Media team" | "Insights" | "Media Operations" | "Business Leadership" | "Other";

export const ROLE_GROUPS: RoleGroup[] = [
  "Planning",
  "Investments",
  "Digital Activation",
  "Media team",
  "Insights",
  "Media Operations",
  "Business Leadership",
  "Other",
];

export type Seniority = "Junior" | "Intermediate" | "Senior" | "Director" | "Executive";

export const SENIORITY: Seniority[] = ["Junior", "Intermediate", "Senior", "Director", "Executive"];

/** First rule that matches wins. */
const GROUP_RULES: [RegExp, RoleGroup][] = [
  [/director of client services|managing director|vice president|chief|head of media|account manager/i, "Business Leadership"],
  [/planner|planning|strategy/i, "Planning"],
  [/buyer|estimator/i, "Investments"],
  [/seo|sem\b/i, "Digital Activation"],
  [/research|insight|intelligence|^analyst$/i, "Insights"],
  [/media operations|billing|administrative|corporate|business affairs|project manager/i, "Media Operations"],
  [/media (supervisor|manager|director|coordinator)|associate media director|regional media director/i, "Media team"],
];

const LEVEL_RULES: [RegExp, Seniority][] = [
  [/vice president|\/vp|managing director|chief|head of/i, "Executive"],
  [/project manager/i, "Intermediate"],
  [/account manager/i, "Senior"],
  [/director|manager|business affairs/i, "Director"],
  [/senior|sr\.|supervisor/i, "Senior"],
  [/junior|assistant|estimator|trainee|coordinator/i, "Junior"],
];

export function roleGroup(title: string): RoleGroup {
  return GROUP_RULES.find(([re]) => re.test(title))?.[1] ?? "Other";
}

export function seniority(title: string): Seniority {
  return LEVEL_RULES.find(([re]) => re.test(title))?.[1] ?? "Intermediate";
}
