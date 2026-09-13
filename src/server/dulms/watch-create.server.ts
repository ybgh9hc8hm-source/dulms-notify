/**
 * Shared "start monitoring this group" path.
 *
 * Used by the dashboard server function, the Telegram inline buttons and the
 * AI assistant, so all three behave identically: the watch is always created
 * fresh (even when the group is open right now) and processed immediately, so
 * an open group is registered on the spot and a closed one is auto-registered
 * the moment it opens.
 */
import { registrationSelections, type RegistrationOption } from "./registration";

export type WatchSelection = {
  courseId: string;
  groupId: string;
  subgroupId: string;
  autoRegister: boolean;
};

export type WatchOutcome = {
  option: RegistrationOption;
  /** true when the seat was secured immediately. */
  registered: boolean;
  message: string;
};

/** Live registration offer (all groups/sections) for one student. */
export async function readRegistrationOffer(userId: string): Promise<RegistrationOption[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, password_ciphertext, key_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) throw new Error("DULMS account is not connected.");

  const { ensureKeyring } = await import("@/server/crypto.server");
  const { readAccountPassword } = await import("@/server/credentials.server");
  const { readRegistrationSnapshot } = await import("./registration");
  await ensureKeyring();
  const snapshot = await readRegistrationSnapshot(
    account.dulms_id,
    readAccountPassword(account.password_ciphertext, account.key_version),
  );
  return snapshot.options;
}

export async function startRegistrationWatch(
  userId: string,
  selection: WatchSelection,
): Promise<WatchOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const options = await readRegistrationOffer(userId);
  const option = registrationSelections(options).find(
    (candidate) =>
      candidate.courseId === selection.courseId &&
      candidate.groupId === selection.groupId &&
      candidate.subgroupId === selection.subgroupId,
  );
  if (!option) throw new Error("This group is no longer offered for registration.");

  const { error } = await supabaseAdmin.from("registration_watches").upsert(
    {
      user_id: userId,
      course_id: option.courseId,
      course_code: option.courseCode,
      course_name: option.courseName,
      group_id: option.groupId,
      group_name: option.groupName,
      subgroup_id: option.subgroupId,
      subgroup_name: option.subgroupName,
      status: "watching",
      was_open: false,
      notified_at: null,
      opened_at: null,
      last_result: null,
      auto_register: selection.autoRegister,
    },
    { onConflict: "user_id,course_id,group_id,subgroup_id" },
  );
  if (error) throw new Error(`Could not start monitoring this group: ${error.message}`);

  const { processRegistrationWatches } = await import("@/server/sync/registration-watch.server");
  await processRegistrationWatches(userId, options);

  const { data: row } = await supabaseAdmin
    .from("registration_watches")
    .select("id, status, last_result")
    .eq("user_id", userId)
    .eq("course_id", option.courseId)
    .eq("group_id", option.groupId)
    .eq("subgroup_id", option.subgroupId)
    .maybeSingle();

  // The watch row is deleted the moment the seat is secured.
  if (!row) return { option, registered: true, message: "تم تسجيلك في هذا الجروب ✅" };
  return {
    option,
    registered: false,
    message: row.last_result ?? "تمت إضافة الجروب للمتابعة.",
  };
}
