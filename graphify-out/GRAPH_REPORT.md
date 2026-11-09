# Graph Report - /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard  (2026-11-09)

## Corpus Check
- 175 files · ~502,194 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2123 nodes · 2732 edges · 78 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 516 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `query()` - 126 edges
2. `map` - 47 edges
3. `test` - 44 edges
4. `FiveSlotSenderService` - 29 edges
5. `LinkedInService` - 27 edges
6. `EmailSchedulerService` - 21 edges
7. `main()` - 15 edges
8. `main()` - 14 edges
9. `main()` - 13 edges
10. `InboxRotationService` - 12 edges

## Toxic Hotspots (high risk + high activity)
1. `EmailSchedulerService` - Risk Score: 81% (CLASS)

## Surprising Connections (you probably didn't know these)
- `handleExportCsv()` --calls--> `map`  [INFERRED]
  /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/src/components/SuppressionListModal.tsx → /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/src/pages/CrmPage.tsx
- `runSchedulerTests()` --calls--> `query()`  [INFERRED]
  /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/tests/scheduler.test.ts → /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts
- `runInboundIntentTests()` --calls--> `query()`  [INFERRED]
  /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/tests/inbound-intent.test.ts → /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts
- `runCsvTests()` --calls--> `query()`  [INFERRED]
  /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/tests/csv-import.test.ts → /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts
- `runSuppressionTests()` --calls--> `query()`  [INFERRED]
  /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/tests/suppression.test.ts → /Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts

## Communities

### Community 0 - "Community 0"

Cohesion: 0.01
Nodes (151): allIds, allLeadsRes, allTargetIds, { audit_pdf_name, audit_pdf_path }, auditKeyTakeaways, auditPdfName, auditPdfPath, auditsDir (+143 more)

### Community 1 - "Community 1"

Cohesion: 0.02
Nodes (42): addAiCommandHistoryTable(), addAutomatedCadenceAndChannelLists(), migrateBatchesAndRetention(), addChannelAutoAssignmentTrigger(), addDealsTasksAndActivities(), addExtremeAutomation(), migrate(), addInboundEmailSyncTable() (+34 more)

### Community 2 - "Community 2"

Cohesion: 0.03
Nodes (44): migrateWebsiteAndCountry(), api, API_BASE, cleanSiteUrl(), eTagCache, getStoredToken(), mapBackendClientToLead(), mapBackendLeadToLead() (+36 more)

### Community 3 - "Community 3"

Cohesion: 0.02
Nodes (76): analysis, analyzeSoakLogFile(), logFile, map, runCsvTests(), loadExtraHistory(), availableCountries, [batchName, setBatchName] (+68 more)

### Community 4 - "Community 4"

Cohesion: 0.02
Nodes (96): active, activeForm, activeLeads, activeLeadsCount, attachments, AVATAR_GRADIENTS, c, cat (+88 more)

### Community 5 - "Community 5"

Cohesion: 0.04
Nodes (29): isValidPdfFile(), validateAuditAsset(), fastCache, MemoryCache, assertNotProduction(), assertProductionImmutability(), computeProductionDatabaseMd5(), connectionString (+21 more)

### Community 6 - "Community 6"

Cohesion: 0.02
Nodes (76): auditCallbackAuthMiddleware(), auditCallbackRouter, auditsDir, base64Data, checkRateLimit(), cleanBase64, estimatedBytes, existingReadyMs (+68 more)

### Community 7 - "Community 7"

Cohesion: 0.02
Nodes (87): agentResult, { autonomousInboundAgent }, bodyText, cached, channel, {
      channel,
      leadIds,
      messages = {},
      intervalSeconds = 0,
    }, claimRes, client (+79 more)

### Community 8 - "Community 8"

Cohesion: 0.04
Nodes (34): [activeTab, setActiveTab], [auditReport, setAuditReport], [bulkError, setBulkError], [bulkFeedback, setBulkFeedback], [bulkIntervalSeconds, setBulkIntervalSeconds], [channelTab, setChannelTab], city, [copiedField, setCopiedField] (+26 more)

### Community 9 - "Community 9"

Cohesion: 0.03
Nodes (57): applyStyleToSelection(), beautifyLinkedInPost(), toPlainText(), toUnicodeBold(), toUnicodeItalic(), [activeTab, setActiveTab], [approvingTaskId, setApprovingTaskId], [autoPilotEnabled, setAutoPilotEnabled] (+49 more)

### Community 10 - "Community 10"

Cohesion: 0.03
Nodes (60): [actionFeedback, setActionFeedback], activeThread, activeThreadMessages, [allInboundHistory, setAllInboundHistory], [allRecentMessages, setAllRecentMessages], allThreads, [approvingReplyId, setApprovingReplyId], attachments (+52 more)

### Community 11 - "Community 11"

Cohesion: 0.03
Nodes (60): { aiCommandService }, aiRouter, { businessName, category, channel = 'email', intent }, check, { commandText, actionType, payload }, contact, contacts, data (+52 more)

### Community 12 - "Community 12"

Cohesion: 0.04
Nodes (46): active, [activeTab, setActiveTab], [cancellingId, setCancellingId], [channel, setChannel], [customInstructions, setCustomInstructions], d, [deletingId, setDeletingId], [dispatchStatusFilter, setDispatchStatusFilter] (+38 more)

### Community 13 - "Community 13"

Cohesion: 0.07
Nodes (20): AiResearchWriterService, generateTailoredOutreachCopy(), HumanizerService, runInboundIntentTests(), OllamaService, handleGenerateAiCopy(), deleted, domain (+12 more)

### Community 14 - "Community 14"

Cohesion: 0.06
Nodes (10): AutonomousDripEngine, list, buildHumanoidHtml(), EmailAdapter, escapeHtml(), EmailSentSyncService, testHtmlEscaping(), InboxRotationService (+2 more)

### Community 15 - "Community 15"

Cohesion: 0.04
Nodes (45): auditRouter, auditsDir, {
      business_name,
      website,
      email,
      phone,
      primary_contact_name,
      category,
      location,
      audit_key_takeaways,
      audit_pdf_name,
      audit_pdf_path,
      targetEndpoint,
      maxRetries = 3,
    }, candidate, chromePath, decoded, domain, filenameParam (+37 more)

### Community 16 - "Community 16"

Cohesion: 0.05
Nodes (40): activeCount, calc, calculation, clientCheck, closedAt, closedTotal, currentDeal, currentDealRes (+32 more)

### Community 17 - "Community 17"

Cohesion: 0.05
Nodes (38): handleDeleteFailedDispatches(), [activeTab, setActiveTab], batchScheduleTimeline, [body, setBody], [cancellingId, setCancellingId], [channel, setChannel], [copyMode, setCopyMode], [customInstructions, setCustomInstructions] (+30 more)

### Community 18 - "Community 18"

Cohesion: 0.07
Nodes (24): allowedOrigins, app, decoded, distPath, forbiddenPatterns, keepAliveUrl, lower, res (+16 more)

### Community 19 - "Community 19"

Cohesion: 0.06
Nodes (33): bounceRate, cached, col, complaintRate, dailyData, dbOk, { fastCache }, healthDescription (+25 more)

### Community 20 - "Community 20"

Cohesion: 0.06
Nodes (30): active, activeChannelMeta, addStep, [aiGeneratingId, setAiGeneratingId], [campaignCategoryFilter, setCampaignCategoryFilter], [campaignChannelFilter, setCampaignChannelFilter], [campaignName, setCampaignName], [campaignSearch, setCampaignSearch] (+22 more)

### Community 21 - "Community 21"

Cohesion: 0.06
Nodes (27): [activeTab, setActiveTab], [batchName, setBatchName], bulkStats, categorySuggestions, displayedRows, duplicateWarning, emptySingleLead, handleFileUpload (+19 more)

### Community 22 - "Community 22"

Cohesion: 0.08
Nodes (22): FailureLogService, [actionInProgress, setActionInProgress], [endDate, setEndDate], [feedback, setFeedback], fetchFailures, handleResolve(), handleRetry(), isResolving (+14 more)

### Community 23 - "Community 23"

Cohesion: 0.08
Nodes (17): [autoOpenContact, setAutoOpenContact], channelCounts, countryCounts, counts, [crmChannelFilter, setCrmChannelFilter], [crmCountryFilter, setCrmCountryFilter], [crmSubFilter, setCrmSubFilter], [isAuthenticated, setIsAuthenticated] (+9 more)

### Community 24 - "Community 24"

Cohesion: 0.14
Nodes (6): AutomatedIntakeEngine, ChannelListAutoAssignmentService, EmailValidatorService, KNOWN_INVALID_USERNAMES, KNOWN_PLACEHOLDER_DOMAINS, RFC_EMAIL_REGEX

### Community 25 - "Community 25"

Cohesion: 0.14
Nodes (4): GmbScraperService, handleImportLeads(), CDPClient, LinkedInPublisherService

### Community 26 - "Community 26"

Cohesion: 0.09
Nodes (20): badgeColors, [executing, setExecuting], [expandedDetailsId, setExpandedDetailsId], fetchHistory(), fetchSuggestions(), handleExecute(), handleFormSubmit(), [history, setHistory] (+12 more)

### Community 27 - "Community 27"

Cohesion: 0.1
Nodes (20): account, { accountName, headline, profileUrl, sessionCookie, accessToken, authMethod }, accounts, { customComment }, draft, id, linkedinRouter, ok (+12 more)

### Community 28 - "Community 28"

Cohesion: 0.1
Nodes (19): adaptersRouter, convId, convRes, { fromPhone, text, messageId }, id, { isClient }, { leadIsolationService }, newConv (+11 more)

### Community 29 - "Community 29"

Cohesion: 0.11
Nodes (18): [addError, setAddError], fetchSuppressionData, handleAddSuppression(), handleExportCsv(), handleRemove(), [isSubmitting, setIsSubmitting], label, [loading, setLoading] (+10 more)

### Community 30 - "Community 30"

Cohesion: 0.11
Nodes (18): cached, deleted, { emailAdapter }, { fastCache }, id, inbox, inboxes, inboxesRouter (+10 more)

### Community 31 - "Community 31"

Cohesion: 0.12
Nodes (16): assignRes, deletedCount, dispatches, { fiveSlotSenderService }, id, ids, isClientError, { leadId, channel = 'email', scheduledFor, subject, body, style, stage, customInstructions } (+8 more)

### Community 32 - "Community 32"

Cohesion: 0.12
Nodes (15): campaignId, campaigns, campaignsRes, campaignsRouter, campRes, delRes, i, id (+7 more)

### Community 33 - "Community 33"

Cohesion: 0.12
Nodes (15): completedAt, countsRes, { id }, insertRes, isPending, {
      leadId,
      dealId,
      title,
      dueDate = new Date().toISOString(),
      priority = 'medium',
      taskType = 'follow_up',
      notes,
    }, newStatus, params (+7 more)

### Community 34 - "Community 34"

Cohesion: 0.14
Nodes (14): defaultUrl, failureCount, formatUptime(), getTimestamp(), intervalMinutes, intervalMs, intervalTimer, parsedInterval (+6 more)

### Community 35 - "Community 35"

Cohesion: 0.14
Nodes (13): convId, convRes, { fiveSlotSenderService }, { id }, item, itemCheck, leadEmail, { leadId, clientId, campaignId, channel, messagePreview } (+5 more)

### Community 36 - "Community 36"

Cohesion: 0.14
Nodes (12): baseItems, dealItems, [dealResults, setDealResults], filteredItems, Icon, inputRef, isSelected, leadItems (+4 more)

### Community 37 - "Community 37"

Cohesion: 0.14
Nodes (11): bounceH, bRate, chartMax, delivRate, isCritical, isExhausted, isWarning, recvH (+3 more)

### Community 38 - "Community 38"

Cohesion: 0.17
Nodes (11): addedCount, id, leadId, { leadIds }, listId, listsRouter, { name, description }, resDelete (+3 more)

### Community 39 - "Community 39"

Cohesion: 0.17
Nodes (11): autopilotRouter, current, currentRes, { dripSettings, inboundSettings }, { enabled, target = 'drip_engine' }, fullStatus, limit, newEnabled (+3 more)

### Community 40 - "Community 40"

Cohesion: 0.18
Nodes (10): [checkingModelId, setCheckingModelId], [diagnosticReport, setDiagnosticReport], handleTestRateLimit(), isChecking, isHealthy, [loading, setLoading], loadModels(), [models, setModels] (+2 more)

### Community 41 - "Community 41"

Cohesion: 0.18
Nodes (9): confirmationHtml, emailParam, leadId, successHtml, targetEmail, tokenParam, unsubscribeRouter, validToken (+1 more)

### Community 42 - "Community 42"

Cohesion: 0.18
Nodes (10): force, { leadId }, { rebalanceAll, listId }, result, safeSettings, slotId, slotsRouter, status (+2 more)

### Community 43 - "Community 43"

Cohesion: 0.18
Nodes (10): activitiesRes, activitiesRouter, existingActivityTitles, insertRes, isOutbound, leadId, { leadId, dealId, activityType = 'note_added', title, description, metadata = {} }, mergedActivities (+2 more)

### Community 44 - "Community 44"

Cohesion: 0.2
Nodes (9): cleanEmails, creditsData, { email }, { emails }, emailVerifierRouter, forceRefresh, millionRaw, results (+1 more)

### Community 45 - "Community 45"

Cohesion: 0.2
Nodes (9): { category, categories, country, state, city, locations, limit, leadsPerLocation, continent }, hasLocations, leads, { leads, listId, batchName, scheduledStartTime }, parsedLeadsPerLocation, parsedLimit, result, scraperRouter (+1 more)

### Community 46 - "Community 46"

Cohesion: 0.2
Nodes (9): authRouter, expectedBuf, isMatch, isValid, loginRateLimiter, { password }, providedBuf, token (+1 more)

### Community 47 - "Community 47"

Cohesion: 0.25
Nodes (7): csvData, failuresRouter, id, result, success, { type, slotId, resolved, startDate, endDate, search }, { type, slotId, resolved, startDate, endDate, search, limit, offset }

### Community 48 - "Community 48"

Cohesion: 0.32
Nodes (5): getCountryFlag(), AVATAR_GRADIENTS, computeEstimatedDeal(), getAvatarGradient(), LeadActivityDrawer()

### Community 49 - "Community 49"

Cohesion: 0.25
Nodes (7): entityType, intervalMs, [isPaused, setIsPaused], [progress, setProgress], step, targetId, timer

### Community 50 - "Community 50"

Cohesion: 0.29
Nodes (6): batchesRouter, batchRes, id, leadIds, leadsRes, result

### Community 51 - "Community 51"

Cohesion: 0.29
Nodes (6): enrollment, enrollments, leadId, { leadId, delayDays }, { leadId, sequenceName, totalSteps }, sequencesRouter

### Community 52 - "Community 52"

Cohesion: 0.29
Nodes (5): colors, countdown, isActive, leads, slot

### Community 53 - "Community 53"

Cohesion: 0.33
Nodes (5): [channelsExpanded, setChannelsExpanded], [countriesExpanded, setCountriesExpanded], [crmExpanded, setCrmExpanded], isChannelActive, isCountryActive

### Community 54 - "Community 54"

Cohesion: 0.33
Nodes (4): isVisible, modalContainerRef, timer, widthMap

### Community 55 - "Community 55"

Cohesion: 0.33
Nodes (4): [error, setError], [loading, setLoading], [password, setPassword], [showPassword, setShowPassword]

### Community 56 - "Community 56"

Cohesion: 0.4
Nodes (4): APP_HINT, APP_RELEASE_NAME, APP_UPDATED_AT, APP_VERSION

### Community 57 - "Community 57"

Cohesion: 0.5
Nodes (1): triggerDocsCanvasAnnotationMode()

### Community 58 - "Community 58"

Cohesion: 0.5
Nodes (1): s

### Community 59 - "Community 59"

Cohesion: 0.5
Nodes (2): isEligible, isSelected

### Community 60 - "Community 60"

Cohesion: 0.5
Nodes (2): colorMap, iconMap

### Community 61 - "Community 61"

Cohesion: 0.5
Nodes (3): CONTINENTS, COUNTRIES, POPULAR_CATEGORIES

### Community 62 - "Community 62"

Cohesion: 0.67
Nodes (2): channelLabels, consentLabels

### Community 63 - "Community 63"

Cohesion: 0.67
Nodes (1): variantMap

### Community 64 - "Community 64"

Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"

Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"

Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"

Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"

Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"

Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"

Cohesion: 1.0
Nodes (1): SENDER_CONFIG

### Community 71 - "Community 71"

Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"

Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"

Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"

Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"

Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"

Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"

Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **1310 isolated node(s):** `keepAliveUrl`, `res`, `app`, `decoded`, `lower` (+1305 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 64`** (2 nodes): `testHealthEndpoint()`, `healthEndpoint.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (2 nodes): `testRateLimit()`, `rateLimit.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (2 nodes): `runAuthTests()`, `auth-session.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (2 nodes): `testLeadEmailValidation()`, `leadEmailValidation.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `testPdfAndTokenSecurity()`, `auditPdfSecurity.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (2 nodes): `runPdfCleanupTest()`, `pdf-cleanup.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `SENDER_CONFIG`, `senderConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `useStore()`, `store.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (2 nodes): `EmptyState()`, `EmptyState.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.