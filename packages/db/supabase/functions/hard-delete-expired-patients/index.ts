import { createClient } from "npm:@supabase/supabase-js@2";

const STORAGE_FOLDERS: Array<{ bucket: string; folderFrom: "id" | "user_id" }> = [
  { bucket: "case-documents", folderFrom: "id" },
  { bucket: "visa-documents", folderFrom: "user_id" },
  { bucket: "avatars", folderFrom: "user_id" },
];

Deno.serve(async (req) => {
  // Gateway JWT verification alone doesn't gate this: the anon key passes it
  // and is public. The Cron Trigger invoking this function must be configured
  // to send `x-cron-secret: <CRON_SECRET>`; anything else is rejected before
  // touching the service-role client below.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: patients, error: queryError } = await supabase
    .from("patients")
    .select("id, user_id")
    .eq("is_deleted", true)
    .lte("scheduled_delete_at", new Date().toISOString());

  if (queryError) {
    return Response.json({ error: queryError.message }, { status: 500 });
  }

  const results = [];

  for (const patient of patients ?? []) {
    let step = "start";
    try {
      for (const { bucket, folderFrom } of STORAGE_FOLDERS) {
        const folder = folderFrom === "id" ? patient.id : patient.user_id;

        step = `list:${bucket}`;
        const { data: names, error: namesError } = await supabase.rpc(
          "get_storage_object_names",
          { p_bucket_id: bucket, p_folder: folder },
        );
        if (namesError) throw namesError;

        if (names?.length) {
          step = `remove:${bucket}`;
          const { error: removeError } = await supabase.storage
            .from(bucket)
            .remove(names);
          if (removeError) throw removeError;
        }
      }

      // Cascades to patients -> cases -> case_documents, visa_submissions ->
      // visa_documents, payment_methods, notifications, etc.
      step = "deleteUser";
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(
        patient.user_id,
      );
      if (deleteUserError) throw deleteUserError;

      results.push({ patientId: patient.id, status: "deleted" });
    } catch (error) {
      const detail = error && typeof error === "object"
        ? JSON.stringify(error, Object.getOwnPropertyNames(error))
        : String(error);
      results.push({ patientId: patient.id, status: "error", step, detail });
    }
  }

  return Response.json({ processed: results.length, results });
});
