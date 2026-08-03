# Deployment Startup Hang Bugfix Design

## Overview

The Node.js backend server successfully prints the startup banner and initializes Alist, but the `app.listen()` callback never executes, leaving the server unresponsive to HTTP requests. The issue manifests in production (Hugging Face Spaces) where the container health check times out and the deployment fails. The server appears stuck after initialization completes, unable to bind to port 7860 or report errors about the binding failure.

## Glossary

- **Bug_Condition (C)**: The condition where the server prints the boot banner and completes initial setup, but the `app.listen()` callback never fires and the server never responds to HTTP requests
- **Property (P)**: The desired behavior when the fix is applied: the server successfully binds to the port and responds to `/api/heartbeat` with a 200 status
- **Preservation**: Existing authentication, middleware, and request handling that must continue to work unchanged
- **`app.listen(port, callback)`**: Express.js method that binds the server to a port and executes the callback when binding completes
- **`getMaintenanceStatus()`**: Async function in `authenticateToken` middleware that queries Supabase for maintenance mode status
- **`exec node server.js`**: Shell command in start.sh that replaces the shell process with Node.js, blocking any monitoring
- **HEALTHCHECK**: Docker health check that calls `/api/heartbeat` to verify the server is responsive
- **Supabase Client**: The `createClient()` initialization that creates the admin client synchronously

## Bug Details

### Bug Condition

The bug manifests when a user deploys the application in a containerized environment (Hugging Face Spaces) and the startup process prints initialization messages but never completes the listen callback. The server becomes unresponsive and the health check fails.

**Formal Specification:**
```
FUNCTION isBugCondition(state)
  INPUT: state of type {bootLogs: string[], serverRunning: boolean, portBound: boolean}
  OUTPUT: boolean
  
  RETURN state.bootLogs contains '🚀 Pusat Arsip Anka'
         AND state.serverRunning = true (process hasn't crashed)
         AND state.portBound = false (listen() callback never fired)
         AND listenCallbackExecuted() = false
END FUNCTION
```

### Examples

**Example 1: Production Hang**
- **Input**: Container starts, NODE_ENV=production, PORT=7860
- **Current Behavior**: Logs show "🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:7860" is never printed; health check times out
- **Expected Behavior**: Logs should show "🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:7860"; health check succeeds
- **Root Cause**: Unknown - no error is logged when `app.listen()` fails or hangs

**Example 2: Missing Port Binding Error**
- **Input**: Another service already bound to port 7860
- **Current Behavior**: No error logged; process hangs silently
- **Expected Behavior**: Error logged: "Error: listen EADDRINUSE: address already in use :::7860"
- **Root Cause**: No error handler on `app.listen()` or `server` object

**Example 3: Middleware Blocking**
- **Input**: Supabase connection is slow or unresponsive at startup
- **Current Behavior**: `getMaintenanceStatus()` is async but may interfere with initial request handling
- **Expected Behavior**: Async operations should not block the server from binding to the port

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All existing Express middleware (CORS, JSON parsing, static file serving) must continue to work
- Authentication token verification must work exactly as before
- Database operations through Supabase must work as before
- Role-based access control (RBAC) authorization must work as before
- All API endpoints must respond to requests exactly as before (same status codes, response formats, error messages)
- Maintenance mode checking must continue to work after the fix

**Scope:**
All inputs that do NOT involve the server startup and binding process should be completely unaffected by this fix. This includes:
- All HTTP requests to existing endpoints (/api/heartbeat, /api/login, /api/files, etc.)
- All database queries and operations
- Authentication and authorization flows
- Error handling for request-level operations
- Response formatting and middleware processing

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Missing Error Handler on Server Binding**: The `app.listen()` call has no error event handler, so if port binding fails (EADDRINUSE, permission denied, etc.), the error is silently swallowed and the callback never fires

2. **Unhandled Promise Rejection in Middleware**: The `getMaintenanceStatus()` async function is called in `authenticateToken` middleware without proper `.catch()` handling, potentially causing an unhandled rejection that blocks the event loop

3. **No 'error' Event Listener on Server Object**: Even if the callback fires, uncaught errors in the server object would not be logged, making debugging impossible

4. **Port Configuration Issue**: The Dockerfile sets `ENV PORT=7860`, but there may be a conflict or the environment variable is not being passed correctly to the Node process

5. **Missing Timeout Handling**: If the server process is trying to perform blocking I/O during startup (e.g., waiting for Supabase), it could block the listen callback indefinitely

## Correctness Properties

Property 1: Bug Condition - Server Successfully Binds to Port

_For any_ startup sequence where the server process executes and completes initialization, the fixed server SHALL successfully bind to the configured port (7860 in production, 4000 in development) and execute the listen callback, logging "🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:{PORT}".

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Request Handling and Authentication

_For any_ incoming HTTP request after the server has started, the fixed code SHALL process the request exactly as the original code did, preserving all middleware execution order, authentication verification, database operations, and response formatting.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, the following changes are needed to ensure robust startup and binding:

**File**: `backend/server.js`

**Changes**:

1. **Add Error Handler to app.listen()**
   - Wrap the listen call in error handling to catch port binding failures
   - Log clear, actionable error messages for common issues (EADDRINUSE, EACCES, etc.)
   - Ensure the process exits or retries gracefully

2. **Add Server Error Event Listener**
   - Attach an 'error' event listener to the server object returned by `app.listen()`
   - Log any errors that occur on the server object (e.g., socket errors)
   - Prevent unhandled exceptions from crashing the process without logging

3. **Improve Async Error Handling in Middleware**
   - The `authenticateToken` middleware uses `.then().catch()` which is good, but ensure it doesn't block request processing
   - Verify that `getMaintenanceStatus()` failures don't prevent the request from continuing

4. **Add Process-Level Error Handlers**
   - Add `process.on('uncaughtException')` handler to catch synchronous errors
   - Add `process.on('unhandledRejection')` handler to catch promise rejections
   - Log these errors clearly for debugging

5. **Ensure PORT Environment Variable is Read Correctly**
   - Verify that `process.env.PORT` is being set correctly in start.sh and Dockerfile
   - Consider adding a startup log that confirms which port the server will bind to

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, create tests that demonstrate the bug on unfixed code by triggering the hang condition, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate server startup in various conditions:
- Simulate a port already in use (EADDRINUSE)
- Simulate permission denied on port binding (EACCES)
- Simulate normal successful binding
- Check that the listen callback is called in success case
- Check that errors are logged in failure cases

Run these tests on the UNFIXED code to observe failures and confirm the root cause (no error handling, no logging of binding failures).

**Test Cases**:
1. **Port Already in Use Test**: Bind a server to port 7860, then start the main server and verify it logs an error and exits (will fail on unfixed code - it will hang instead)
2. **Normal Startup Test**: Start the server normally and verify the listen callback fires and logs appear (will fail on unfixed code if there's an underlying issue)
3. **Environment Variable Test**: Verify PORT environment variable is correctly read from the environment
4. **Startup Timeout Test**: Set a timeout and verify the server binds within a reasonable time (e.g., 5 seconds)

**Expected Counterexamples**:
- Port binding fails silently without error logging
- Listen callback never fires even though process is running
- No indication of what went wrong during startup

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (server startup), the fixed server successfully binds to the port and responds to requests.

**Pseudocode:**
```
FOR ALL startup_condition IN [normal_startup, port_already_used, permission_denied] DO
  IF startup_condition = normal_startup THEN
    result := startServer()
    ASSERT result.listenCallbackFired = true
    ASSERT result.portBound = true
    ASSERT HTTP_GET /api/heartbeat returns 200
  ELSE IF startup_condition = port_already_used THEN
    ASSERT error logged with "EADDRINUSE"
    ASSERT process exits gracefully
  ELSE IF startup_condition = permission_denied THEN
    ASSERT error logged with "EACCES"
    ASSERT process exits gracefully
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all existing request-handling behaviors, the fixed server produces the same result as the original server.

**Pseudocode:**
```
FOR ALL incoming_request IN [authenticated_request, unauthenticated_request, admin_request, normal_user_request] DO
  ASSERT fixed_server(incoming_request).response = original_server(incoming_request).response
  ASSERT fixed_server(incoming_request).statusCode = original_server(incoming_request).statusCode
  ASSERT fixed_server(incoming_request).headers = original_server(incoming_request).headers
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across different request types
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all requests

**Test Plan**: For each preserved behavior (authentication, endpoint response, middleware execution), write tests that verify the behavior is identical before and after the fix.

**Test Cases**:
1. **Authentication Preservation**: Send authenticated requests to protected endpoints and verify the response is identical before/after fix
2. **Endpoint Response Preservation**: Send requests to various endpoints (/api/heartbeat, /api/login, /api/files) and verify responses are identical
3. **Middleware Execution Preservation**: Verify CORS headers, JSON parsing, static file serving work identically
4. **Error Response Preservation**: Send invalid requests and verify error responses are identical
5. **Database Query Preservation**: Send requests that trigger database operations and verify results are identical

### Unit Tests

- Test that `app.listen()` error handler catches EADDRINUSE and logs correctly
- Test that `app.listen()` error handler catches EACCES (permission denied) and logs correctly
- Test that server 'error' event listener catches and logs errors
- Test that `process.on('uncaughtException')` handler logs synchronous errors
- Test that `process.on('unhandledRejection')` handler logs promise rejections
- Test that PORT environment variable is correctly read and used

### Property-Based Tests

- Generate random HTTP requests (GET, POST, PUT, DELETE) to various endpoints and verify responses are identical before/after fix
- Generate random authentication tokens (valid, invalid, expired) and verify auth behavior is preserved
- Generate random database states and verify query results are identical
- Generate random error conditions and verify error responses are preserved

### Integration Tests

- Full server startup and health check verification
- Server startup with various PORT environment variable values
- Server startup with missing environment variables (should use defaults)
- Server responding to multiple concurrent requests after startup
- Server gracefully handling port binding failure and exiting with error message
