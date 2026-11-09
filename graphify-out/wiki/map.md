# map

> God node · 47 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/src/pages/CrmPage.tsx](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/src/pages/CrmPage.tsx#L679)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as map
    participant P1 as .sendEmail()
    participant P2 as query()
    participant P3 as .sendNextStageToLead()
    participant P4 as .processGlobalTick()
    participant P5 as main()
    participant P6 as main()
    participant P7 as .executeEmailDispatch()
    participant P8 as main()
    participant P9 as .isSuppressed()
    participant P10 as .processImportedLeads()
    participant P11 as .triggerAuditForLead()
    participant P12 as .scheduleListDispatch()
    participant P13 as .isolateFailedLead()
    participant P14 as .runEnrichmentCycle()
    participant P15 as .syncInboundEmails()
    participant P16 as .submitContactForm()
    participant P17 as .autoAssignLeads()
    participant P18 as .importScrapedLeads()
    participant P19 as .executeWhatsAppDispatch()
    participant P20 as .autoAssignUnassignedLeads()
    participant P21 as .handleDispatchFailure()
    participant P22 as main()
    participant P23 as main()
    participant P24 as .detectAndSaveFormForLead()
    participant P25 as .syncFromGoogleMaps()
    participant P26 as .suppress()
    participant P27 as .processInboundMessage()
    participant P28 as .getAccountStatus()
    participant P29 as .processPendingDispatches()
    participant P30 as .enrichLead()
    participant P31 as .ensurePdfForLead()
    participant P32 as .flagAndMoveLeadToInvalidList()
    participant P33 as .createPost()
    participant P34 as .publishExistingPost()
    participant P35 as .scheduleBatchDispatch()
    participant P36 as .executeLinkedInDispatch()
    participant P37 as .runLocalAudit()
    participant P38 as runCsvTests()
    participant P39 as runSuppressionTests()
    participant P40 as .enqueueDraft()
    participant P41 as .batchVerifyAndUpdateLeads()
    participant P42 as .checkDailyReset()
    participant P43 as usePostgresAuthState()
    participant P44 as .checkAndResetQuotas()
    participant P45 as .getAllAccounts()
    participant P46 as .processScheduledPosts()
    participant P47 as .executeFacebookDispatch()
    participant P48 as .executeInstagramDispatch()
    participant P49 as .updateSettings()
    participant P50 as .reapStaleSendingClaims()
    participant P51 as .checkReportDeliveryWatchdog()
    participant P52 as .verifyAndSend()
    participant P53 as .scrapeSingleLead()
    participant P54 as .retryFailure()
    participant P55 as .getAccountCredentials()
    participant P56 as .getPosts()
    participant P57 as .getProspectCommentTasks()
    participant P58 as .approveAndPostComment()
    participant P59 as .addProspectPostToMonitor()
    participant P60 as .seedSampleProspectPosts()
    participant P61 as .deleteFailedDispatches()
    participant P62 as .acquireLeaderLock()
    participant P63 as .assignLeadToSlot()
    participant P64 as .convertLeadToClient()
    participant P65 as runInboundIntentTests()
    participant P66 as run28DayRetentionCleanup()
    participant P67 as .enqueueDraft()
    participant P68 as .handleInboundWebhook()
    participant P69 as runMigrations()
    participant P70 as migrateWebsiteAndCountry()
    participant P71 as addSuppressionAndSequences()
    participant P72 as handleUpdateClient()
    participant P73 as .updateSettings()
    participant P74 as .handleInboundLeadMessage()
    participant P75 as .recordDispatch()
    participant P76 as .dismissUnmatchedEmail()
    participant P77 as .clearAllUnmatchedEmails()
    participant P78 as .resolveFailure()
    participant P79 as .connectAccount()
    participant P80 as .disconnectAccount()
    participant P81 as .deleteAccount()
    participant P82 as .confirmManualPost()
    participant P83 as .updatePost()
    participant P84 as .advanceStep()
    participant P85 as .delayForOoo()
    participant P86 as .updateStatusForLead()
    participant P87 as .releaseLeaderLock()
    participant P88 as .resumeCircuitBreaker()
    participant P89 as .saveCommandHistory()
    participant P90 as runSchedulerTests()
    participant P91 as .markDraftSent()
    participant P92 as .markDraftSent()
    participant P93 as runMigration()
    participant P94 as seedRealisticCrmData()
    participant P95 as migrateListsAndEnforceSingleEntity()
    participant P96 as addLinkedInPublishingColumns()
    participant P97 as migrateLocationAndCleanWebsites()
    participant P98 as addScheduledDispatchesTable()
    participant P99 as addLinkedInTables()
    participant P100 as migrateBatchesAndRetention()
    participant P101 as addSeenRepliedToMessages()
    participant P102 as addMultiChannelScheduling()
    participant P103 as addManualReviewStatus()
    participant P104 as migrate()
    participant P105 as runSeed()
    participant P106 as addInboundEmailSyncTable()
    participant P107 as addWhatsAppPostgresSessionTable()
    participant P108 as migrate()
    participant P109 as addInboxRotationAndTrigramIndexes()
    participant P110 as addExtremeAutomation()
    participant P111 as addChannelAutoAssignmentTrigger()
    participant P112 as addDealsTasksAndActivities()
    participant P113 as addAutomatedCadenceAndChannelLists()
    participant P114 as addAiCommandHistoryTable()
    participant P115 as .unsuppress()
    participant P116 as .deleteInbox()
    participant P117 as .addAccount()
    participant P118 as .deletePost()
    participant P119 as .skipCommentTask()
    participant P120 as .getDispatches()
    participant P121 as .cancelDispatch()
    participant P122 as .retryDispatch()
    participant P123 as .deleteDispatches()
    participant P124 as .enrollLead()
    participant P125 as .clearCommandHistory()
    participant P126 as .processClientFollowUps()
    participant P127 as test
    participant P128 as .generateAuditPdf()
    participant P129 as .auditWebsite()
    participant P130 as .verifyEmail()
    participant P131 as .hasValidWebsite()
    participant P132 as .routeOutreachMessage()
    participant P133 as .getPoolSummary()
    participant P134 as buildHumanoidHtml()
    participant P135 as .getNextAvailableInbox()
    participant P136 as .getTransporter()
    participant P137 as .appendSentEmail()
    participant P138 as classifySmtpError()
    participant P139 as .isMock()
    participant P140 as .isTestDatabase()
    participant P141 as .getInboxById()
    participant P142 as .sanitizeTokens()
    participant P143 as .verifyCompliance()
    participant P144 as .getEmailCopy()
    participant P145 as .executeCommand()
    participant P146 as .checkHealth()
    participant P147 as parseImport()
    participant P148 as .scrapeWithCdp()
    participant P149 as .improviseText()
    participant P150 as markDuplicates()
    participant P151 as applyStyleToSelection()
    participant P152 as validateAuditAsset()
    participant P153 as .searchGmb()
    participant P154 as .generatePitchForLead()
    participant P155 as .generatePost()
    participant P156 as handleSchedule()
    participant P157 as .analyzeAudit()
    participant P158 as .extractBouncedRecipient()
    participant P159 as analyzeSoakLogFile()
    participant P160 as .buildAuditHtml()
    participant P161 as .writeFallbackPdf()
    participant P162 as .sendBulkNextStage()
    participant P163 as .getModelsStatus()
    participant P164 as .crawlWebsiteForContact()
    participant P165 as .normalizeRemoteAuditData()
    participant P166 as .exportCsv()
    participant P167 as .bulkVerifyWithWaValidator()
    participant P168 as handleSendBulkList()
    participant P169 as .getUnmatchedInboundEmails()
    participant P170 as .getCommandHistory()
    participant P171 as markIncomplete()
    participant P172 as loadExtraHistory()
    participant P173 as handleExportCsv()
    participant P174 as selectAllInboxes()
    participant P175 as handleAddBulkLocations()
    participant P176 as handleStartScrape()
    participant P177 as handleSelectAll()
    participant P178 as handleExportCsv()
    P0->>+ P1: calls
    P1-->>- P0: return
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
    P2->>+ P48: calls
    P48-->>- P2: return
    P2->>+ P49: calls
    P49-->>- P2: return
    P2->>+ P50: calls
    P50-->>- P2: return
    P2->>+ P51: calls
    P51-->>- P2: return
    P2->>+ P52: calls
    P52-->>- P2: return
    P2->>+ P53: calls
    P53-->>- P2: return
    P2->>+ P54: calls
    P54-->>- P2: return
    P2->>+ P55: calls
    P55-->>- P2: return
    P2->>+ P56: calls
    P56-->>- P2: return
    P2->>+ P57: calls
    P57-->>- P2: return
    P2->>+ P58: calls
    P58-->>- P2: return
    P2->>+ P59: calls
    P59-->>- P2: return
    P2->>+ P60: calls
    P60-->>- P2: return
    P2->>+ P61: calls
    P61-->>- P2: return
    P2->>+ P62: calls
    P62-->>- P2: return
    P2->>+ P63: calls
    P63-->>- P2: return
    P2->>+ P64: calls
    P64-->>- P2: return
    P2->>+ P65: calls
    P65-->>- P2: return
    P2->>+ P66: calls
    P66-->>- P2: return
    P2->>+ P67: calls
    P67-->>- P2: return
    P2->>+ P68: calls
    P68-->>- P2: return
    P2->>+ P69: calls
    P69-->>- P2: return
    P2->>+ P70: calls
    P70-->>- P2: return
    P2->>+ P71: calls
    P71-->>- P2: return
    P2->>+ P72: calls
    P72-->>- P2: return
    P2->>+ P73: calls
    P73-->>- P2: return
    P2->>+ P74: calls
    P74-->>- P2: return
    P2->>+ P75: calls
    P75-->>- P2: return
    P2->>+ P76: calls
    P76-->>- P2: return
    P2->>+ P77: calls
    P77-->>- P2: return
    P2->>+ P78: calls
    P78-->>- P2: return
    P2->>+ P79: calls
    P79-->>- P2: return
    P2->>+ P80: calls
    P80-->>- P2: return
    P2->>+ P81: calls
    P81-->>- P2: return
    P2->>+ P82: calls
    P82-->>- P2: return
    P2->>+ P83: calls
    P83-->>- P2: return
    P2->>+ P84: calls
    P84-->>- P2: return
    P2->>+ P85: calls
    P85-->>- P2: return
    P2->>+ P86: calls
    P86-->>- P2: return
    P2->>+ P87: calls
    P87-->>- P2: return
    P2->>+ P88: calls
    P88-->>- P2: return
    P2->>+ P89: calls
    P89-->>- P2: return
    P2->>+ P90: calls
    P90-->>- P2: return
    P2->>+ P91: calls
    P91-->>- P2: return
    P2->>+ P92: calls
    P92-->>- P2: return
    P2->>+ P93: calls
    P93-->>- P2: return
    P2->>+ P94: calls
    P94-->>- P2: return
    P2->>+ P95: calls
    P95-->>- P2: return
    P2->>+ P96: calls
    P96-->>- P2: return
    P2->>+ P97: calls
    P97-->>- P2: return
    P2->>+ P98: calls
    P98-->>- P2: return
    P2->>+ P99: calls
    P99-->>- P2: return
    P2->>+ P100: calls
    P100-->>- P2: return
    P2->>+ P101: calls
    P101-->>- P2: return
    P2->>+ P102: calls
    P102-->>- P2: return
    P2->>+ P103: calls
    P103-->>- P2: return
    P2->>+ P104: calls
    P104-->>- P2: return
    P2->>+ P105: calls
    P105-->>- P2: return
    P2->>+ P106: calls
    P106-->>- P2: return
    P2->>+ P107: calls
    P107-->>- P2: return
    P2->>+ P108: calls
    P108-->>- P2: return
    P2->>+ P109: calls
    P109-->>- P2: return
    P2->>+ P110: calls
    P110-->>- P2: return
    P2->>+ P111: calls
    P111-->>- P2: return
    P2->>+ P112: calls
    P112-->>- P2: return
    P2->>+ P113: calls
    P113-->>- P2: return
    P2->>+ P114: calls
    P114-->>- P2: return
    P2->>+ P115: calls
    P115-->>- P2: return
    P2->>+ P116: calls
    P116-->>- P2: return
    P2->>+ P117: calls
    P117-->>- P2: return
    P2->>+ P118: calls
    P118-->>- P2: return
    P2->>+ P119: calls
    P119-->>- P2: return
    P2->>+ P120: calls
    P120-->>- P2: return
    P2->>+ P121: calls
    P121-->>- P2: return
    P2->>+ P122: calls
    P122-->>- P2: return
    P2->>+ P123: calls
    P123-->>- P2: return
    P2->>+ P124: calls
    P124-->>- P2: return
    P2->>+ P125: calls
    P125-->>- P2: return
    P2->>+ P126: calls
    P126-->>- P2: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P27: calls
    P27-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P1->>+ P134: calls
    P134-->>- P1: return
    P1->>+ P135: calls
    P135-->>- P1: return
    P1->>+ P136: calls
    P136-->>- P1: return
    P1->>+ P137: calls
    P137-->>- P1: return
    P1->>+ P138: calls
    P138-->>- P1: return
    P1->>+ P139: calls
    P139-->>- P1: return
    P1->>+ P140: calls
    P140-->>- P1: return
    P1->>+ P141: calls
    P141-->>- P1: return
    P1->>+ P142: calls
    P142-->>- P1: return
    P1->>+ P143: calls
    P143-->>- P1: return
    P1->>+ P75: calls
    P75-->>- P1: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P10: calls
    P10-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P20: calls
    P20-->>- P0: return
    P0->>+ P21: calls
    P21-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P31: calls
    P31-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P38: calls
    P38-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P56: calls
    P56-->>- P0: return
    P0->>+ P57: calls
    P57-->>- P0: return
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
- [[.getEmailCopy()]] `INFERRED`
- [[.processImportedLeads()]] `INFERRED`
- [[.executeCommand()]] `INFERRED`
- [[.checkHealth()]] `INFERRED`
- [[.autoAssignUnassignedLeads()]] `INFERRED`
- [[.handleDispatchFailure()]] `INFERRED`
- [[parseImport()]] `INFERRED`
- [[.scrapeWithCdp()]] `INFERRED`
- [[.improviseText()]] `INFERRED`
- [[markDuplicates()]] `INFERRED`
- [[.ensurePdfForLead()]] `INFERRED`
- [[applyStyleToSelection()]] `INFERRED`
- [[runCsvTests()]] `INFERRED`
- [[validateAuditAsset()]] `INFERRED`
- [[.searchGmb()]] `INFERRED`
- [[.generatePitchForLead()]] `INFERRED`
- [[.getAllAccounts()]] `INFERRED`
- [[.generatePost()]] `INFERRED`

### contains
- [[CrmPage.tsx]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*