# Bugfix Requirements: Deployment Startup Hang

## Introduction

The application successfully prints its startup banner and logs indicate Alist is running, but the Node.js backend fails to bind to the port and respond to health checks, causing the Hugging Face Spaces container to remain stuck in "starting" status indefinitely. The startup logs halt after printing initialization messages, indicating the server never completes initialization or fails silently when attempting to listen on the port.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the application starts in a Hugging Face Spaces container THEN the startup banner prints successfully ("🚀 Pusat Arsip Anka Backend v2.1 running") and initialization logs appear, but the backend server never calls the listen() callback and no "listening on port" message is printed

1.2 WHEN the application initialization completes THEN the Node.js process remains running but is unresponsive to HTTP requests at /api/heartbeat and the container health check times out

1.3 WHEN the Hugging Face health check attempts to connect to http://localhost:7860/api/heartbeat THEN the connection is refused or times out, and the health check fails

### Expected Behavior (Correct)

2.1 WHEN the application starts in a Hugging Face Spaces container THEN the backend server successfully binds to the configured PORT (7860) and logs indicate "listening on port 7860" or similar confirmation

2.2 WHEN the backend server completes initialization THEN it is responsive and returns HTTP 200 with {"status": "alive", "version": "2.0.1-fixed"} when the /api/heartbeat endpoint is called

2.3 WHEN the Hugging Face health check runs THEN it successfully connects to http://localhost:7860/api/heartbeat, receives a valid response, and the health check passes

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the application starts with valid environment variables (PORT, NODE_ENV, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) THEN existing middleware (CORS, JSON parsing, static file serving) continues to function normally

3.2 WHEN the application starts without Alist available (alist command not found) THEN the backend server still starts successfully and responds to requests (Alist is optional)

3.3 WHEN database initialization or Supabase connection fails during startup THEN the server still binds to the port and responds to /api/heartbeat, allowing monitoring and debugging

3.4 WHEN the application is already running on the specified port THEN a clear error message is logged indicating the port is in use, rather than silently hanging
