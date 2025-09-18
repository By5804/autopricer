import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Call the RPC function to get only the users that are due
    const { data: usersToProcess, error } = await supabaseAdmin.rpc('get_due_users');

    if (error) throw error;

    if (!usersToProcess || usersToProcess.length === 0) {
      console.log("Scheduler ran, no users due for processing.");
      return new Response(JSON.stringify({ message: "No users due for processing." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    for (const user of usersToProcess) {
      console.log(`Updating timestamp and triggering process for user: ${user.user_id}`);
      
      // 1. Update the timestamp immediately to prevent re-triggering
      const { error: updateError } = await supabaseAdmin
        .from('user_configurations')
        .update({ cron_last_run_at: new Date().toISOString() })
        .eq('user_id', user.user_id);

      if (updateError) {
        console.error(`Failed to update timestamp for user ${user.user_id}:`, updateError);
        continue; // Skip to the next user
      }

      // 2. Invoke the processing function
      try {
        const { error: invokeError } = await supabaseAdmin.functions.invoke('process-products', {
          body: { user_id: user.user_id },
        });
        
        if (invokeError) {
          console.error(`Error invoking process-products for user ${user.user_id}:`, invokeError);
        } else {
          console.log(`Successfully invoked process-products for user ${user.user_id}.`);
        }
      } catch (invokeCatchError) {
        console.error(`Exception when invoking process-products for user ${user.user_id}:`, invokeCatchError);
      }
    }

    return new Response(JSON.stringify({ message: `Triggered processing for ${usersToProcess.length} user(s).` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});