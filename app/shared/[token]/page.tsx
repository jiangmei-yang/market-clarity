import {readSharedDashboard} from "@/app/lib/dashboard-server";
import {SharedWorkspaceView} from "@/app/components/shared-workspace-view";

export default async function SharedWorkspacePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;const shared=await readSharedDashboard(token);const workspace=shared.workspace;
  return <SharedWorkspaceView workspace={workspace} sharedAt={shared.sharedAt} token={token}/>;
}
