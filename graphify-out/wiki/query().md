# query()

> God node · 126 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts#L43)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as query()
    participant P1 as .sendEmail()
    participant P2 as map
    participant P3 as .sendNextStageToLead()
    participant P4 as .getEmailCopy()
    participant P5 as .processImportedLeads()
    participant P6 as .executeCommand()
    participant P7 as .checkHealth()
    participant P8 as .autoAssignUnassignedLeads()
    participant P9 as .handleDispatchFailure()
    participant P10 as parseImport()
    participant P11 as .scrapeWithCdp()
    participant P12 as .improviseText()
    participant P13 as markDuplicates()
    participant P14 as .ensurePdfForLead()
    participant P15 as applyStyleToSelection()
    participant P16 as runCsvTests()
    participant P17 as validateAuditAsset()
    participant P18 as .searchGmb()
    participant P19 as .generatePitchForLead()
    participant P20 as .getAllAccounts()
    participant P21 as .generatePost()
    participant P22 as handleSchedule()
    participant P23 as buildHumanoidHtml()
    participant P24 as .analyzeAudit()
    participant P25 as .extractBouncedRecipient()
    participant P26 as .getPosts()
    participant P27 as .getProspectCommentTasks()
    participant P28 as analyzeSoakLogFile()
    participant P29 as .buildAuditHtml()
    participant P30 as .writeFallbackPdf()
    participant P31 as .sendBulkNextStage()
    participant P32 as .getModelsStatus()
    participant P33 as .crawlWebsiteForContact()
    participant P34 as .normalizeRemoteAuditData()
    participant P35 as .exportCsv()
    participant P36 as .bulkVerifyWithWaValidator()
    participant P37 as handleSendBulkList()
    participant P38 as .getUnmatchedInboundEmails()
    participant P39 as .getCommandHistory()
    participant P40 as markIncomplete()
    participant P41 as loadExtraHistory()
    participant P42 as handleExportCsv()
    participant P43 as selectAllInboxes()
    participant P44 as handleAddBulkLocations()
    participant P45 as handleStartScrape()
    participant P46 as handleSelectAll()
    participant P47 as handleExportCsv()
    participant P48 as test
    participant P49 as .executeEmailDispatch()
    participant P50 as .isolateFailedLead()
    participant P51 as .generateAuditPdf()
    participant P52 as .auditWebsite()
    participant P53 as .verifyEmail()
    participant P54 as .hasValidWebsite()
    participant P55 as .routeOutreachMessage()
    participant P56 as .processInboundMessage()
    participant P57 as .getPoolSummary()
    participant P58 as .getNextAvailableInbox()
    participant P59 as .getTransporter()
    participant P60 as .appendSentEmail()
    participant P61 as classifySmtpError()
    participant P62 as .isMock()
    participant P63 as .isTestDatabase()
    participant P64 as .getInboxById()
    participant P65 as .sanitizeTokens()
    participant P66 as .verifyCompliance()
    participant P67 as .recordDispatch()
    participant P68 as .processGlobalTick()
    participant P69 as main()
    participant P70 as main()
    participant P71 as main()
    participant P72 as .isSuppressed()
    participant P73 as .triggerAuditForLead()
    participant P74 as .scheduleListDispatch()
    participant P75 as .runEnrichmentCycle()
    participant P76 as .syncInboundEmails()
    participant P77 as .submitContactForm()
    participant P78 as .autoAssignLeads()
    participant P79 as .importScrapedLeads()
    participant P80 as .executeWhatsAppDispatch()
    participant P81 as main()
    participant P82 as main()
    participant P83 as .detectAndSaveFormForLead()
    participant P84 as .syncFromGoogleMaps()
    participant P85 as .suppress()
    participant P86 as .getAccountStatus()
    participant P87 as .processPendingDispatches()
    participant P88 as .enrichLead()
    participant P89 as .flagAndMoveLeadToInvalidList()
    participant P90 as .createPost()
    participant P91 as .publishExistingPost()
    participant P92 as .scheduleBatchDispatch()
    participant P93 as .executeLinkedInDispatch()
    participant P94 as .runLocalAudit()
    participant P95 as runSuppressionTests()
    participant P96 as .enqueueDraft()
    participant P97 as .batchVerifyAndUpdateLeads()
    participant P98 as .checkDailyReset()
    participant P99 as usePostgresAuthState()
    participant P100 as .checkAndResetQuotas()
    participant P101 as .processScheduledPosts()
    participant P102 as .executeFacebookDispatch()
    participant P103 as .executeInstagramDispatch()
    participant P104 as .updateSettings()
    participant P105 as .reapStaleSendingClaims()
    participant P106 as .checkReportDeliveryWatchdog()
    participant P107 as .verifyAndSend()
    participant P108 as .scrapeSingleLead()
    participant P109 as .retryFailure()
    participant P110 as .getAccountCredentials()
    participant P111 as .approveAndPostComment()
    participant P112 as .addProspectPostToMonitor()
    participant P113 as .seedSampleProspectPosts()
    participant P114 as .deleteFailedDispatches()
    participant P115 as .acquireLeaderLock()
    participant P116 as .assignLeadToSlot()
    participant P117 as .convertLeadToClient()
    participant P118 as runInboundIntentTests()
    participant P119 as run28DayRetentionCleanup()
    participant P120 as .enqueueDraft()
    participant P121 as .handleInboundWebhook()
    participant P122 as runMigrations()
    participant P123 as migrateWebsiteAndCountry()
    participant P124 as addSuppressionAndSequences()
    participant P125 as handleUpdateClient()
    participant P126 as .updateSettings()
    participant P127 as .handleInboundLeadMessage()
    participant P128 as .dismissUnmatchedEmail()
    participant P129 as .clearAllUnmatchedEmails()
    participant P130 as .resolveFailure()
    participant P131 as .connectAccount()
    participant P132 as .disconnectAccount()
    participant P133 as .deleteAccount()
    participant P134 as .confirmManualPost()
    participant P135 as .updatePost()
    participant P136 as .advanceStep()
    participant P137 as .delayForOoo()
    participant P138 as .updateStatusForLead()
    participant P139 as .releaseLeaderLock()
    participant P140 as .resumeCircuitBreaker()
    participant P141 as .saveCommandHistory()
    participant P142 as runSchedulerTests()
    participant P143 as .markDraftSent()
    participant P144 as .markDraftSent()
    participant P145 as runMigration()
    participant P146 as seedRealisticCrmData()
    participant P147 as migrateListsAndEnforceSingleEntity()
    participant P148 as addLinkedInPublishingColumns()
    participant P149 as migrateLocationAndCleanWebsites()
    participant P150 as addScheduledDispatchesTable()
    participant P151 as addLinkedInTables()
    participant P152 as migrateBatchesAndRetention()
    participant P153 as addSeenRepliedToMessages()
    participant P154 as addMultiChannelScheduling()
    participant P155 as addManualReviewStatus()
    participant P156 as migrate()
    participant P157 as runSeed()
    participant P158 as addInboundEmailSyncTable()
    participant P159 as addWhatsAppPostgresSessionTable()
    participant P160 as migrate()
    participant P161 as addInboxRotationAndTrigramIndexes()
    participant P162 as addExtremeAutomation()
    participant P163 as addChannelAutoAssignmentTrigger()
    participant P164 as addDealsTasksAndActivities()
    participant P165 as addAutomatedCadenceAndChannelLists()
    participant P166 as addAiCommandHistoryTable()
    participant P167 as .unsuppress()
    participant P168 as .deleteInbox()
    participant P169 as .addAccount()
    participant P170 as .deletePost()
    participant P171 as .skipCommentTask()
    participant P172 as .getDispatches()
    participant P173 as .cancelDispatch()
    participant P174 as .retryDispatch()
    participant P175 as .deleteDispatches()
    participant P176 as .enrollLead()
    participant P177 as .clearCommandHistory()
    participant P178 as .processClientFollowUps()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P3: calls
    P3-->>- P2: return
    P2->>+ P4: calls
    P4-->>- P2: return
    P2->>+ P5: calls
    P5-->>- P2: return
    P2->>+ P6: calls
    P6-->>- P2: return
    P2->>+ P7: calls
    P7-->>- P2: return
    P2->>+ P8: calls
    P8-->>- P2: return
    P2->>+ P9: calls
    P9-->>- P2: return
    P2->>+ P10: calls
    P10-->>- P2: return
    P2->>+ P11: calls
    P11-->>- P2: return
    P2->>+ P12: calls
    P12-->>- P2: return
    P2->>+ P13: calls
    P13-->>- P2: return
    P2->>+ P14: calls
    P14-->>- P2: return
    P2->>+ P15: calls
    P15-->>- P2: return
    P2->>+ P16: calls
    P16-->>- P2: return
    P2->>+ P17: calls
    P17-->>- P2: return
    P2->>+ P18: calls
    P18-->>- P2: return
    P2->>+ P19: calls
    P19-->>- P2: return
    P2->>+ P20: calls
    P20-->>- P2: return
    P2->>+ P21: calls
    P21-->>- P2: return
    P2->>+ P22: calls
    P22-->>- P2: return
    P2->>+ P23: calls
    P23-->>- P2: return
    P2->>+ P24: calls
    P24-->>- P2: return
    P2->>+ P25: calls
    P25-->>- P2: return
    P2->>+ P26: calls
    P26-->>- P2: return
    P2->>+ P27: calls
    P27-->>- P2: return
    P2->>+ P28: calls
    P28-->>- P2: return
    P2->>+ P29: calls
    P29-->>- P2: return
    P2->>+ P30: calls
    P30-->>- P2: return
    P2->>+ P31: calls
    P31-->>- P2: return
    P2->>+ P32: calls
    P32-->>- P2: return
    P2->>+ P33: calls
    P33-->>- P2: return
    P2->>+ P34: calls
    P34-->>- P2: return
    P2->>+ P35: calls
    P35-->>- P2: return
    P2->>+ P36: calls
    P36-->>- P2: return
    P2->>+ P37: calls
    P37-->>- P2: return
    P2->>+ P38: calls
    P38-->>- P2: return
    P2->>+ P39: calls
    P39-->>- P2: return
    P2->>+ P40: calls
    P40-->>- P2: return
    P2->>+ P41: calls
    P41-->>- P2: return
    P2->>+ P42: calls
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P2->>+ P44: calls
    P44-->>- P2: return
    P2->>+ P45: calls
    P45-->>- P2: return
    P2->>+ P46: calls
    P46-->>- P2: return
    P2->>+ P47: calls
    P47-->>- P2: return
    P1->>+ P48: calls
    P48-->>- P1: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P52: calls
    P52-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P55: calls
    P55-->>- P1: return
    P1->>+ P56: calls
    P56-->>- P1: return
    P1->>+ P57: calls
    P57-->>- P1: return
    P1->>+ P23: calls
    P23-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P61: calls
    P61-->>- P1: return
    P1->>+ P62: calls
    P62-->>- P1: return
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P66: calls
    P66-->>- P1: return
    P1->>+ P67: calls
    P67-->>- P1: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P68: calls
    P68-->>- P0: return
    P0->>+ P69: calls
    P69-->>- P0: return
    P0->>+ P70: calls
    P70-->>- P0: return
    P0->>+ P49: calls
    P49-->>- P0: return
    P0->>+ P71: calls
    P71-->>- P0: return
    P0->>+ P72: calls
    P72-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P73: calls
    P73-->>- P0: return
    P0->>+ P74: calls
    P74-->>- P0: return
    P0->>+ P50: calls
    P50-->>- P0: return
    P0->>+ P75: calls
    P75-->>- P0: return
    P0->>+ P76: calls
    P76-->>- P0: return
    P0->>+ P77: calls
    P77-->>- P0: return
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P79: calls
    P79-->>- P0: return
    P0->>+ P80: calls
    P80-->>- P0: return
    P0->>+ P8: calls
    P8-->>- P0: return
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P81: calls
    P81-->>- P0: return
    P0->>+ P82: calls
    P82-->>- P0: return
    P0->>+ P83: calls
    P83-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
    P0->>+ P85: calls
    P85-->>- P0: return
    P0->>+ P56: calls
    P56-->>- P0: return
    P0->>+ P86: calls
    P86-->>- P0: return
    P0->>+ P87: calls
    P87-->>- P0: return
    P0->>+ P88: calls
    P88-->>- P0: return
    P0->>+ P14: calls
    P14-->>- P0: return
    P0->>+ P89: calls
    P89-->>- P0: return
    P0->>+ P90: calls
    P90-->>- P0: return
    P0->>+ P91: calls
    P91-->>- P0: return
    P0->>+ P92: calls
    P92-->>- P0: return
    P0->>+ P93: calls
    P93-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P16: calls
    P16-->>- P0: return
    P0->>+ P95: calls
    P95-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P98: calls
    P98-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P20: calls
    P20-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P103: calls
    P103-->>- P0: return
    P0->>+ P104: calls
    P104-->>- P0: return
    P0->>+ P105: calls
    P105-->>- P0: return
    P0->>+ P106: calls
    P106-->>- P0: return
    P0->>+ P107: calls
    P107-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P109: calls
    P109-->>- P0: return
    P0->>+ P110: calls
    P110-->>- P0: return
    P0->>+ P26: calls
    P26-->>- P0: return
    P0->>+ P27: calls
    P27-->>- P0: return
    P0->>+ P111: calls
    P111-->>- P0: return
    P0->>+ P112: calls
    P112-->>- P0: return
    P0->>+ P113: calls
    P113-->>- P0: return
    P0->>+ P114: calls
    P114-->>- P0: return
    P0->>+ P115: calls
    P115-->>- P0: return
    P0->>+ P116: calls
    P116-->>- P0: return
    P0->>+ P117: calls
    P117-->>- P0: return
    P0->>+ P118: calls
    P118-->>- P0: return
    P0->>+ P119: calls
    P119-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P121: calls
    P121-->>- P0: return
    P0->>+ P122: calls
    P122-->>- P0: return
    P0->>+ P123: calls
    P123-->>- P0: return
    P0->>+ P124: calls
    P124-->>- P0: return
    P0->>+ P125: calls
    P125-->>- P0: return
    P0->>+ P126: calls
    P126-->>- P0: return
    P0->>+ P127: calls
    P127-->>- P0: return
    P0->>+ P67: calls
    P67-->>- P0: return
    P0->>+ P128: calls
    P128-->>- P0: return
    P0->>+ P129: calls
    P129-->>- P0: return
    P0->>+ P130: calls
    P130-->>- P0: return
    P0->>+ P131: calls
    P131-->>- P0: return
    P0->>+ P132: calls
    P132-->>- P0: return
    P0->>+ P133: calls
    P133-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P136: calls
    P136-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
    P0->>+ P141: calls
    P141-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
    P0->>+ P143: calls
    P143-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
    P0->>+ P160: calls
    P160-->>- P0: return
    P0->>+ P161: calls
    P161-->>- P0: return
    P0->>+ P162: calls
    P162-->>- P0: return
    P0->>+ P163: calls
    P163-->>- P0: return
    P0->>+ P164: calls
    P164-->>- P0: return
    P0->>+ P165: calls
    P165-->>- P0: return
    P0->>+ P166: calls
    P166-->>- P0: return
    P0->>+ P167: calls
    P167-->>- P0: return
    P0->>+ P168: calls
    P168-->>- P0: return
    P0->>+ P169: calls
    P169-->>- P0: return
    P0->>+ P170: calls
    P170-->>- P0: return
    P0->>+ P171: calls
    P171-->>- P0: return
    P0->>+ P172: calls
    P172-->>- P0: return
    P0->>+ P173: calls
    P173-->>- P0: return
    P0->>+ P174: calls
    P174-->>- P0: return
    P0->>+ P175: calls
    P175-->>- P0: return
    P0->>+ P176: calls
    P176-->>- P0: return
    P0->>+ P177: calls
    P177-->>- P0: return
    P0->>+ P178: calls
    P178-->>- P0: return
```

## Connections by Relation

### calls
- [[.sendEmail()]] `INFERRED`
- [[.sendNextStageToLead()]] `INFERRED`
- [[.processGlobalTick()]] `INFERRED`
- [[main()]] `INFERRED`
- [[main()]] `INFERRED`
- [[.executeEmailDispatch()]] `INFERRED`
- [[main()]] `INFERRED`
- [[.isSuppressed()]] `INFERRED`
- [[.processImportedLeads()]] `INFERRED`
- [[.triggerAuditForLead()]] `INFERRED`
- [[.scheduleListDispatch()]] `INFERRED`
- [[.isolateFailedLead()]] `INFERRED`
- [[.runEnrichmentCycle()]] `INFERRED`
- [[.syncInboundEmails()]] `INFERRED`
- [[.submitContactForm()]] `INFERRED`
- [[.autoAssignLeads()]] `INFERRED`
- [[.importScrapedLeads()]] `INFERRED`
- [[.executeWhatsAppDispatch()]] `INFERRED`
- [[.autoAssignUnassignedLeads()]] `INFERRED`
- [[.handleDispatchFailure()]] `INFERRED`

### contains
- [[db.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*