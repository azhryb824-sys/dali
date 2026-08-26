import postgres from "postgres";
const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL is required");
const sql=postgres(databaseUrl,{max:1,prepare:false});
try{
  const [table]=await sql`SELECT to_regclass('public.contract_signature_requests')::text AS name`;
  const tableReady=table?.name==="contract_signature_requests";
  let invalidUploaded=[],invalidPending=[];
  if(tableReady){
    invalidUploaded=await sql`
      SELECT r.id,r.contract_id,r.document_id,r.signed_storage_key,d.storage_key,c.status AS contract_status
      FROM contract_signature_requests r
      JOIN company_documents d ON d.id=r.document_id
      JOIN workforce_contracts c ON c.id=r.contract_id
      WHERE r.status='uploaded' AND (
        r.signed_storage_key IS NULL OR r.uploaded_at IS NULL OR r.signed_size_bytes<=0
        OR d.storage_key<>r.signed_storage_key OR d.source<>'signed-upload'
        OR c.status NOT IN ('signed','active','suspended','expired','terminated','superseded')
        OR NOT EXISTS (SELECT 1 FROM private.object_storage o WHERE o.storage_key=r.signed_storage_key)
      )
    `;
    invalidPending=await sql`
      SELECT contract_id,count(*)::integer AS pending_count
      FROM contract_signature_requests WHERE status='pending'
      GROUP BY contract_id HAVING count(*)>1
    `;
  }
  const status=tableReady&&!invalidUploaded.length&&!invalidPending.length?"ok":"mismatch";
  console.log(JSON.stringify({status,tableReady,invalidUploaded,invalidPending},null,2));
  if(status!=="ok")process.exitCode=1;
}finally{await sql.end({timeout:5})}
