import type { ProjectRecord } from "../../electron/types";

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function workspaceDisplayName(project: ProjectRecord, allProjects: ProjectRecord[]) {
  const { repository, workspace } = project.identity;
  const collision = allProjects.some(
    (candidate) =>
      candidate.id !== project.id &&
      candidate.identity.repository.rootPath === repository.rootPath &&
      candidate.identity.workspace.label === workspace.label,
  );
  return collision ? workspace.relativePath : workspace.label;
}

export function projectDisplayName(project: ProjectRecord, allProjects: ProjectRecord[]) {
  const { repository } = project.identity;
  const workspaceName = workspaceDisplayName(project, allProjects);
  return `${repository.label} · ${workspaceName}`;
}

export function projectAccessibleName(project: ProjectRecord, allProjects: ProjectRecord[]) {
  const { repository } = project.identity;
  const workspaceName = workspaceDisplayName(project, allProjects);
  return `${repository.label}, ${workspaceName}`;
}

export function groupProjectsByRepository(projects: ProjectRecord[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      slug: string | null;
      projects: ProjectRecord[];
    }
  >();

  for (const project of projects) {
    const { repository } = project.identity;
    const group = groups.get(repository.rootPath) ?? {
      key: repository.rootPath,
      label: repository.label,
      slug: repository.slug,
      projects: [],
    };
    group.projects.push(project);
    groups.set(repository.rootPath, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      projects: group.projects.sort(
        (a, b) =>
          compareText(a.identity.workspace.label, b.identity.workspace.label) ||
          compareText(a.identity.workspace.relativePath, b.identity.workspace.relativePath),
      ),
    }))
    .sort((a, b) => compareText(a.label, b.label) || compareText(a.key, b.key));
}
