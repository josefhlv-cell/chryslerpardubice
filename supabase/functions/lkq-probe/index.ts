const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchCode, step } = await req.json().catch(() => ({ searchCode: '68225170AA', step: 'search' }));
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY not set');

    const akUser = Deno.env.get('AUTOKELLY_USER') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';

    if (step === 'login-and-search') {
      // Use Firecrawl actions to login, then search
      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://www.lkq.cz/homepage/car',
          formats: ['markdown'],
          waitFor: 3000,
          actions: [
            { type: 'wait', milliseconds: 2000 },
            // Click login button to open login dialog
            { type: 'click', selector: '.desktop-link .logout' },
            { type: 'wait', milliseconds: 1000 },
            // Fill username
            { type: 'write', selector: '#UserName', text: akUser },
            // Fill password
            { type: 'write', selector: '#Password', text: akPass },
            // Submit
            { type: 'click', selector: '#AKLoginDialog button[type="submit"]' },
            { type: 'wait', milliseconds: 5000 },
            // Now type in search
            { type: 'write', selector: '#SearchFocus', text: searchCode },
            { type: 'wait', milliseconds: 500 },
            // Click search button
            { type: 'click', selector: '.hoverBTN' },
            { type: 'wait', milliseconds: 5000 },
            { type: 'screenshot' },
            { type: 'scrape' },
          ],
        }),
      });
      const data = await resp.json();
      const md = data.data?.markdown || data.markdown || '';
      const screenshot = data.data?.screenshot || data.screenshot || '';
      
      return new Response(JSON.stringify({
        success: resp.ok,
        step: 'login-and-search',
        markdownLength: md.length,
        markdownPreview: md.substring(0, 3000),
        hasScreenshot: !!screenshot,
        screenshotPreview: screenshot ? screenshot.substring(0, 100) + '...' : null,
        rawKeys: Object.keys(data.data || data || {}),
      }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: Just render search results page as guest
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.lkq.cz/Search/ResultList?searchText=${searchCode}`,
        formats: ['markdown'],
        waitFor: 8000,
        actions: [
          { type: 'wait', milliseconds: 5000 },
          { type: 'screenshot' },
          { type: 'scrape' },
        ],
      }),
    });
    
    const data = await resp.json();
    const md = data.data?.markdown || data.markdown || '';
    const screenshot = data.data?.screenshot || data.screenshot || '';

    return new Response(JSON.stringify({
      success: resp.ok,
      step: 'guest-search',
      markdownLength: md.length,
      markdownPreview: md.substring(0, 3000),
      hasScreenshot: !!screenshot,
      rawKeys: Object.keys(data.data || data || {}),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
