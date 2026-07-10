export type OpenStoryIdentityConfig = {
  repository?: string;
  workspace?: string;
};

export type ProjectIdentity = {
  repository: {
    label: string;
    slug: string | null;
    rootPath: string;
  };
  workspace: {
    label: string;
    relativePath: string;
    rootPath: string;
  };
  source: "automatic" | "config";
};

export function formatProjectIdentity(identity: ProjectIdentity): string {
  const { repository, workspace } = identity;
  if (workspace.relativePath === "." && repository.label === workspace.label) {
    return repository.label;
  }
  return `${repository.label} · ${workspace.label}`;
}
