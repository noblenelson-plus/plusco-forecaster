/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
const {GoogleAuth}=require('google-auth-library');const fs=require('fs');
const files={quantcast:['19Bv157kZ6lfXdX8qg-1DVLPKi0V1ipRq','media'],amazon:['1M0Rk19DeE9qsuNAIlFkwpDaK6kW4arUnd2W0O4Ga_MM','export'],billups:['1BRw182BFSdrZk26HQjMQl4-sm0dSkwv5A4vgMEUOCiU','export']};
(async()=>{const t=(await (await new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient()).getAccessToken()).token;
for(const [k,[id,mode]] of Object.entries(files)){const url=mode==='media'?`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`:`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
const r=await fetch(url,{headers:{Authorization:'Bearer '+t,'x-goog-user-project':'pluscoops'}});const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync(`in/${k}.xlsx`,b);console.log(k,r.status,b.length);}})();
