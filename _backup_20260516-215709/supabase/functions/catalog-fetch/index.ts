const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheck.from('user_roles').select('role').eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: admin required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const catalogPass = Deno.env.get('CATALOG_PASS') || '';
    const catalogUrl = 'https://www.vernostsevyplaci.cz/cnd/';

    console.log('Step 1: Scraping catalog login page...');

    // First, scrape the page - Firecrawl handles Cloudflare
    const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: catalogUrl,
        formats: ['html', 'markdown'],
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeResp.json();
    
    if (!scrapeResp.ok) {
      console.error('Firecrawl scrape error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: 'Scrape failed', details: scrapeData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = scrapeData.data?.html || scrapeData.html || '';
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

    // Check if we see the login form or the catalog content
    const isLoginPage = html.includes('submit-password') || html.includes('name="password"');
    const hasCatalogContent = html.includes('Zadejte kód') || html.includes('VYHLEDAT') || markdown.includes('ceník');

    console.log('Is login page:', isLoginPage);
    console.log('Has catalog content:', hasCatalogContent);
    console.log('HTML length:', html.length);
    console.log('Markdown preview:', markdown.substring(0, 500));

    // Try scraping with actions to submit the password form
    if (isLoginPage) {
      console.log('Step 2: Attempting to submit password via Firecrawl actions...');
      
      const actionResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: catalogUrl,
          formats: ['html', 'markdown'],
          waitFor: 5000,
          actions: [
            { type: 'wait', milliseconds: 2000 },
            { 
              type: 'executeJavascript', 
              script: `
                const pwInput = document.querySelector('input[name="password"]');
                if (pwInput) { 
                  pwInput.value = '${catalogPass}';
                  const form = pwInput.closest('form');
                  if (form) { form.submit(); }
                }
              `
            },
            { type: 'wait', milliseconds: 8000 },
            { type: 'screenshot' },
            { type: 'scrape' },
          ],
        }),
      });

      const actionData = await actionResp.json();
      
      if (!actionResp.ok) {
        console.error('Firecrawl action error:', actionData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Action scrape failed',
            loginPageFound: true,
            details: actionData 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const actionHtml = actionData.data?.html || actionData.html || '';
      const actionMarkdown = actionData.data?.markdown || actionData.markdown || '';
      const passedLogin = !actionHtml.includes('submit-password') || actionHtml.includes('Zadejte kód');

      console.log('Passed login:', passedLogin);
      console.log('Action HTML length:', actionHtml.length);
      console.log('Action markdown preview:', actionMarkdown.substring(0, 500));

      return new Response(
        JSON.stringify({
          success: true,
          passedLogin,
          htmlLength: actionHtml.length,
          markdownPreview: actionMarkdown.substring(0, 3000),
          htmlPreview: actionHtml.substring(0, 3000),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        passedLogin: !isLoginPage,
        hasCatalogContent,
        htmlLength: html.length,
        markdownPreview: markdown.substring(0, 3000),
        htmlPreview: html.substring(0, 3000),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Catalog fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
