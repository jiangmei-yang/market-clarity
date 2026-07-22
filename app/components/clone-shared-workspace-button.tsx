"use client";

import {useState} from "react";
import {Copy} from "lucide-react";

export function CloneSharedWorkspaceButton({token}:{token:string}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <div className="shared-clone-action"><button disabled={busy} onClick={async()=>{setBusy(true);const response=await fetch(`/shared-workspaces/${token}/clone`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})});if(response.ok)location.href="/workspace";else{const body=await response.json() as {message?:string};setMessage(body.message||"复制失败");setBusy(false);}}}><Copy/>{busy?"正在复制":"复制到我的工作台"}</button>{message&&<small>{message}</small>}</div>;
}
