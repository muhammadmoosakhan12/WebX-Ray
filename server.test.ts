import { analyzeWebsite } from './src/utils/auditEngine';

// ANSI terminal colors for clean test reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ${RED}✗${RESET} ${testName}`);
    if (details) console.error(`    Details: ${details}`);
    testsFailed++;
  }
}

console.log(`${CYAN}Running WebX-Ray Audit Accuracy & Controlled Fixture Tests...${RESET}\n`);

// ==========================================
// FIXTURE 1: Rich Static HTML
// ==========================================
console.log(`${CYAN}Test Suite 1: Full Static Semantic HTML Fixture${RESET}`);
const staticHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acme Software — Enterprise Cloud Solutions</title>
  <meta name="description" content="Discover powerful cloud infrastructure built for high-growth development teams. Get started with a 14-day free trial.">
  <link rel="canonical" href="https://acme.example.com">
  <meta property="og:title" content="Acme Software">
  <meta property="og:description" content="Enterprise Cloud Solutions">
  <meta property="og:image" content="https://acme.example.com/banner.jpg">
  <link rel="icon" href="/favicon.ico">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head>
<body>
  <nav aria-label="Main Navigation">
    <a href="/features">Features</a>
    <a href="/pricing">Pricing</a>
  </nav>
  <main>
    <h1>Next-Generation Cloud Platform</h1>
    <p>Streamline deployment with zero configuration.</p>
    <img src="/dashboard.png" alt="Interactive cloud metrics dashboard">
    <button aria-label="Get Started">Get Started</button>
  </main>
</body>
</html>
`;

const staticReport = analyzeWebsite(
  {
    targetUrl: 'https://acme.example.com',
    finalUrl: 'https://acme.example.com',
    httpStatus: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
    },
    fetchTimeMs: 120,
    contentType: 'text/html; charset=utf-8',
    contentLengthBytes: staticHtml.length,
  },
  staticHtml
);

assert(staticReport.isClientRendered === false, 'Correctly identifies purely static HTML (no SPA shell)');
const titleFinding = staticReport.findings.find(f => f.id === 'seo_title_optimal');
assert(titleFinding?.status === 'passed', 'SEO Title passes for optimal length');
assert(staticReport.findings.find(f => f.id === 'seo_h1_passed')?.status === 'passed', 'H1 heading passes with 1 main heading');
assert(staticReport.findings.find(f => f.id === 'tech_charset_passed')?.status === 'passed', 'Charset is passed');
assert(staticReport.findings.find(f => f.id === 'a11y_viewport_passed')?.status === 'passed', 'Viewport is passed');
assert(staticReport.findings.find(f => f.id === 'usability_nav_passed')?.status === 'passed', 'Navigation landmark is passed');
assert(staticReport.categories.seo.score !== null && staticReport.categories.seo.score >= 90, 'SEO category score is high on semantic markup');


// ==========================================
// FIXTURE 2: Client-Rendered Application Shell (YouTube/React-like)
// ==========================================
console.log(`\n${CYAN}Test Suite 2: Client-Rendered Dynamic Application Shell Fixture${RESET}`);
const spaShellHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>YouTube</title>
  <link rel="icon" href="https://www.youtube.com/favicon.ico">
  <script>
    window.ytcfg = { set: function() {} };
    window.ytcfg.set({ "EXPERIMENTS": true });
  </script>
</head>
<body>
  <ytd-app>
    <div id="content">Loading application...</div>
  </ytd-app>
  <script src="/s/player/base.js" async></script>
</body>
</html>
`;

const spaReport = analyzeWebsite(
  {
    targetUrl: 'https://www.youtube.com/',
    finalUrl: 'https://www.youtube.com/',
    httpStatus: 200,
    headers: {
      // Notice: Charset declared in HTTP header as YouTube does
      'content-type': 'text/html; charset=utf-8',
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
    },
    fetchTimeMs: 85,
    contentType: 'text/html; charset=utf-8',
    contentLengthBytes: spaShellHtml.length,
  },
  spaShellHtml
);

assert(spaReport.isClientRendered === true, 'Correctly detects client-rendered dynamic application markers');
assert(spaReport.clientRenderedMarkers.length > 0, 'Lists specific client application markers (<ytd-app>, ytcfg)');

// Title check: "YouTube" is 7 chars. Must be PASSED, not failed!
const youtubeTitle = spaReport.findings.find(f => f.id === 'seo_title_optimal');
assert(youtubeTitle?.status === 'passed', 'Short brand title ("YouTube") passes as valid concise title');

// Charset check: Even without <meta charset>, it was in HTTP Content-Type header! Must pass!
const spaCharset = spaReport.findings.find(f => f.id === 'tech_charset_passed');
assert(spaCharset?.status === 'passed', 'Charset is verified from HTTP Content-Type header');

// H1 check: In initial HTML there is no H1, but since it is a client-rendered app shell, must be INCONCLUSIVE!
const spaH1 = spaReport.findings.find(f => f.id === 'seo_h1_client_rendered');
assert(spaH1 !== undefined, 'H1 check triggers client-rendered heuristic');
assert(spaH1?.status === 'inconclusive', 'H1 is marked INCONCLUSIVE, not failed');
assert(spaH1?.confidence === 'medium', 'H1 finding confidence is medium (acknowledges DOM hydration)');

// Navigation landmark check: Must be INCONCLUSIVE, not failed!
const spaNav = spaReport.findings.find(f => f.id === 'usability_nav_inconclusive');
assert(spaNav?.status === 'inconclusive', 'Navigation landmark is marked INCONCLUSIVE, not failed');

// Scoring denominator rule: Inconclusive checks must NOT be penalized in the denominator!
const seoCategory = spaReport.categories.seo;
assert(seoCategory.inconclusive >= 1, 'Inconclusive checks are counted in category metadata');
assert(seoCategory.applicableCount === (seoCategory.passed + seoCategory.warning + seoCategory.failed), 'Applicable denominator excludes inconclusive checks');


// ==========================================
// FIXTURE 3: Broken/Deficient Static HTML
// ==========================================
console.log(`\n${CYAN}Test Suite 3: Deficient Static HTML Fixture${RESET}`);
const brokenHtml = `
<html>
<head>
  <!-- Missing title -->
  <!-- Missing charset -->
  <!-- Missing viewport -->
</head>
<body>
  <h1>Heading 1</h1>
  <h1>Duplicate Heading 1</h1>
  <img src="photo.jpg">
  <img src="avatar.jpg">
</body>
</html>
`;

const brokenReport = analyzeWebsite(
  {
    targetUrl: 'http://insecure-broken.example.com',
    finalUrl: 'http://insecure-broken.example.com',
    httpStatus: 200,
    headers: {
      'content-type': 'text/html', // No charset in header either
    },
    fetchTimeMs: 400,
    contentType: 'text/html',
    contentLengthBytes: brokenHtml.length,
  },
  brokenHtml
);

assert(brokenReport.findings.find(f => f.id === 'seo_title_missing')?.status === 'failed', 'Missing title accurately marked as failed');
assert(brokenReport.findings.find(f => f.id === 'tech_charset_missing')?.status === 'warning', 'Missing charset accurately marked as warning');
assert(brokenReport.findings.find(f => f.id === 'tech_https_missing')?.status === 'failed', 'Insecure HTTP accurately marked as failed');
assert(brokenReport.findings.find(f => f.id === 'seo_h1_multiple')?.status === 'warning', 'Multiple H1s accurately flagged as warning');
assert(brokenReport.findings.find(f => f.id === 'a11y_images_missing_alt')?.status === 'failed', 'Missing image alts accurately flagged');


// ==========================================
// FIXTURE 4: Technical Honesty on Performance
// ==========================================
console.log(`\n${CYAN}Test Suite 4: Performance & Core Web Vitals Honesty${RESET}`);
const cwvFinding = staticReport.findings.find(f => f.id === 'perf_cwv_untested');
assert(cwvFinding?.status === 'not_tested', 'Core Web Vitals marked as Not Tested (preventing fake measurements)');
assert(cwvFinding?.testMethod === 'not_tested', 'CWV testMethod is not_tested');
assert(staticReport.categories.performance.notTested >= 1, 'Not Tested checks recorded in category score');


// ==========================================
// FIXTURE 5: HTTP 403 Forbidden / Anti-Bot Access Denied (ChatGPT Case)
// ==========================================
console.log(`\n${CYAN}Test Suite 5: HTTP 403 Forbidden & Incomplete Audit Handling (ChatGPT Scenario)${RESET}`);
const chatgptErrorHtml = `
<!DOCTYPE html>
<html lang="en-US">
<head>
  <title>Just a moment...</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body>
  <div class="cf-browser-verification cf-im-under-attack">
    <h1>Please verify you are a human</h1>
    <p>Cloudflare Ray ID: 8d1f2e345678abcd</p>
  </div>
</body>
</html>
`;

const chatgptReport = analyzeWebsite(
  {
    targetUrl: 'https://chatgpt.com/',
    finalUrl: 'https://chatgpt.com/',
    httpStatus: 403,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'cf-ray': '8d1f2e345678abcd-IAD',
    },
    fetchTimeMs: 38, // Fast 38ms response time
    contentType: 'text/html; charset=UTF-8',
    contentLengthBytes: 9216, // 9 KB payload
  },
  chatgptErrorHtml
);

assert(chatgptReport.auditStatus === 'incomplete', 'HTTP 403 sets auditStatus to "incomplete"');
assert(chatgptReport.overallScore === null, 'HTTP 403 does not produce a normal overall score (overallScore is null)');
assert(chatgptReport.categories.performance.score === null, 'Fast 38ms response on 403 does NOT award 100% performance score (score is null)');
assert(chatgptReport.categories.seo.score === null, 'SEO category score is unavailable (null) on 403 response');
assert(chatgptReport.categories.accessibility.score === null, 'Accessibility category score is unavailable (null) on 403 response');
assert(chatgptReport.categories.usability.score === null, 'Usability category score is unavailable (null) on 403 response');

const statusErrorFinding = chatgptReport.findings.find(f => f.id === 'tech_http_status_error');
assert(statusErrorFinding?.status === 'failed', 'Technical finding flags HTTP 403 access block as failed');
assert(statusErrorFinding?.priority === 'critical', 'HTTP 403 finding is marked critical priority');

const perfTtfbFinding = chatgptReport.findings.find(f => f.id === 'perf_server_response_time');
assert(perfTtfbFinding?.status === 'not_tested', 'Performance TTFB on 403 is marked not_tested for website assessment');

const seoTitleUntested = chatgptReport.findings.find(f => f.id === 'seo_title_untested');
assert(seoTitleUntested?.status === 'not_tested', 'Does not evaluate Cloudflare error title as website SEO (marked not_tested)');

assert(chatgptReport.unperformedChecks !== undefined && chatgptReport.unperformedChecks.length > 0, 'Lists unperformed checks that could not be evaluated');


// ==========================================
// FIXTURE 6: HTTP 429 Too Many Requests (Rate Limited)
// ==========================================
console.log(`\n${CYAN}Test Suite 6: HTTP 429 Rate Limited Response Handling${RESET}`);
const rateLimitHtml = `<html><body><h1>429 Too Many Requests</h1></body></html>`;
const rateLimitReport = analyzeWebsite(
  {
    targetUrl: 'https://api-heavy.example.com/',
    finalUrl: 'https://api-heavy.example.com/',
    httpStatus: 429,
    headers: {
      'content-type': 'text/html',
      'retry-after': '60',
    },
    fetchTimeMs: 150,
    contentType: 'text/html',
    contentLengthBytes: rateLimitHtml.length,
  },
  rateLimitHtml
);

assert(rateLimitReport.auditStatus === 'incomplete', 'HTTP 429 sets auditStatus to "incomplete"');
assert(rateLimitReport.overallScore === null, 'HTTP 429 produces null overall score');
assert(rateLimitReport.categories.performance.score === null, 'HTTP 429 performance score is null');
assert(rateLimitReport.findings.some(f => f.title.includes('HTTP 429 Too Many Requests')), 'Flags HTTP 429 rate limit error in findings');


// ==========================================
// FIXTURE 7: HTTP 500 Internal Server Error
// ==========================================
console.log(`\n${CYAN}Test Suite 7: HTTP 500 Server Error Response Handling${RESET}`);
const serverErrorHtml = `<html><body><h1>500 Internal Server Error</h1></body></html>`;
const serverErrorReport = analyzeWebsite(
  {
    targetUrl: 'https://failing-backend.example.com/',
    finalUrl: 'https://failing-backend.example.com/',
    httpStatus: 500,
    headers: {
      'content-type': 'text/html',
    },
    fetchTimeMs: 500,
    contentType: 'text/html',
    contentLengthBytes: serverErrorHtml.length,
  },
  serverErrorHtml
);

assert(serverErrorReport.auditStatus === 'incomplete', 'HTTP 500 sets auditStatus to "incomplete"');
assert(serverErrorReport.overallScore === null, 'HTTP 500 produces null overall score');
assert(serverErrorReport.categories.performance.score === null, 'HTTP 500 performance score is null');
assert(serverErrorReport.findings.some(f => f.title.includes('HTTP 500 Internal Server Error')), 'Flags HTTP 500 server error in findings');


// ==========================================
// TEST SUMMARY
// ==========================================
console.log(`\n==========================================`);
console.log(`Total tests: ${testsPassed + testsFailed}`);
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
if (testsFailed > 0) {
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}All audit accuracy and HTTP error tests passed successfully!${RESET}\n`);
}

