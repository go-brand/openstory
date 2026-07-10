import type { ProjectIdentity } from "@gobrand/openstory-config";
import type { ProjectRecord } from "./types";
import type { ViteHostStatus } from "./vite-host";

export type ManifestRequest = {
  projectId: string;
  projectPath: string;
  port: number;
  generation: number;
};

export function shouldApplyManifestResponse(
  request: ManifestRequest,
  currentProject: ProjectRecord | undefined,
  currentStatus: ViteHostStatus,
  currentGeneration: number,
  identity: ProjectIdentity | undefined,
) {
  return (
    currentProject?.id === request.projectId &&
    currentProject.path === request.projectPath &&
    currentStatus.status === "ready" &&
    currentStatus.port === request.port &&
    currentGeneration === request.generation &&
    (!identity || identity.workspace.rootPath === request.projectPath)
  );
}
