const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand, model, year, engine, query } = await req.json();

    const catalogUrl = Deno.env.get('CATALOG_URL');
    const catalogUser = Deno.env.get('CATALOG_USER');
    const catalogPass = Deno.env.get('CATALOG_PASS');

    if (!catalogUrl) {
      // Return mock data when catalog is not configured
      const mockParts = [
        { name: "Brzdové destičky přední", oem: "68225170AA", price: 2450, available: true },
        { name: "Olejový filtr", oem: "68191349AC", price: 380, available: true },
        { name: "Vzduchový filtr", oem: "04861756AA", price: 650, available: false },
        { name: "Řemen rozvodu", oem: "68258275AA", price: 1200, available: true },
        { name: "Zapalovací svíčky sada", oem: "SPLZFR5C11", price: 890, available: true },
      ].filter(p => 
        !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.oem.toLowerCase().includes(query.toLowerCase())
      );

      return new Response(
        JSON.stringify({ success: true, data: mockParts, source: 'mock' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real catalog proxy - credentials stay server-side
    const response = await fetch(catalogUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${catalogUser}:${catalogPass}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brand, model, year, engine, query }),
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, data, source: 'catalog' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Catalog proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
