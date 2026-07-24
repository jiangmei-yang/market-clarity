"use client";

import {useState} from "react";
import {Copy} from "lucide-react";
import {pick,useI18n} from "../i18n";

export function CloneSharedWorkspaceButton({token}:{token:string}){
  const{isEnglish}=useI18n();
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <div className="shared-clone-action"><button disabled={busy} onClick={async()=>{setBusy(true);const response=await fetch(`/shared-workspaces/${token}/clone`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})});if(response.ok)location.href="/workspace";else{const body=await response.json() as {message?:string};setMessage(body.message||pick(isEnglish,"复制失败","Could not copy workspace"));setBusy(false);}}}><Copy/>{busy?pick(isEnglish,"正在复制","Copying"):pick(isEnglish,"复制到我的工作台","Copy to my workspace")}</button>{message&&<small>{message}</small>}</div>;
}
