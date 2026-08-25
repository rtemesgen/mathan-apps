import { supabase } from '../supabase';

export type PersonalDataArchive = {
  format: 'mathan-personal-export';
  schema_version: '1';
  exported_at: string;
  profile: unknown;
  memberships: unknown;
  snapshots: unknown;
  trucks: unknown;
  truck_owners: unknown;
  truck_transactions: unknown;
};

/** Cross-app account export. The Settings UI receives data, not table details. */
export async function loadPersonalDataArchive(userId: string): Promise<PersonalDataArchive> {
  const [profile, memberships, snapshots, trucks, truckOwners, truckTransactions] = await Promise.all([
    supabase.from('workspace_profiles').select('user_id,display_name,phone,updated_at').eq('user_id', userId).maybeSingle(),
    supabase.rpc('list_my_workspaces'),
    supabase.from('app_state_snapshots').select('workspace_id,domain,payload,revision,updated_at'),
    supabase.from('trucks').select('*'),
    supabase.from('truck_owners').select('*'),
    supabase.from('truck_transactions').select('*'),
  ]);
  const failure = [profile, memberships, snapshots, trucks, truckOwners, truckTransactions].find((result) => result.error)?.error;
  if (failure) throw failure;
  return {
    format: 'mathan-personal-export',
    schema_version: '1',
    exported_at: new Date().toISOString(),
    profile: profile.data,
    memberships: memberships.data,
    snapshots: snapshots.data,
    trucks: trucks.data,
    truck_owners: truckOwners.data,
    truck_transactions: truckTransactions.data,
  };
}
