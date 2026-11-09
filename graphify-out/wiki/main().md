# main()

> God node · 13 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/scripts/testItem10EmailAndUnsubscribe.ts](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/scripts/testItem10EmailAndUnsubscribe.ts#L10)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as main()
    participant P1 as query()
    participant P2 as .sendEmail()
    participant P3 as map
    participant P4 as test
    participant P5 as .sendNextStageToLead()
    participant P6 as .executeEmailDispatch()
    participant P7 as .isolateFailedLead()
    participant P8 as .generateAuditPdf()
    participant P9 as .auditWebsite()
    participant P10 as .verifyEmail()
    participant P11 as .hasValidWebsite()
    participant P12 as .routeOutreachMessage()
    participant P13 as .processInboundMessage()
    participant P14 as .getPoolSummary()
    participant P15 as buildHumanoidHtml()
    participant P16 as .getNextAvailableInbox()
    participant P17 as .getTransporter()
    participant P18 as .appendSentEmail()
    participant P19 as classifySmtpError()
    participant P20 as .isMock()
    participant P21 as .isTestDatabase()
    participant P22 as .getInboxById()
    participant P23 as .sanitizeTokens()
    participant P24 as .verifyCompliance()
    participant P25 as .recordDispatch()
    participant P26 as .processGlobalTick()
    participant P27 as main()
    participant P28 as main()
    participant P29 as .isSuppressed()
    participant P30 as .processImportedLeads()
    participant P31 as .triggerAuditForLead()
    participant P32 as .scheduleListDispatch()
    participant P33 as .runEnrichmentCycle()
    participant P34 as .syncInboundEmails()
    participant P35 as .submitContactForm()
    participant P36 as .autoAssignLeads()
    participant P37 as .importScrapedLeads()
    participant P38 as .executeWhatsAppDispatch()
    participant P39 as .autoAssignUnassignedLeads()
    participant P40 as .handleDispatchFailure()
    participant P41 as main()
    participant P42 as main()
    participant P43 as .detectAndSaveFormForLead()
    participant P44 as .syncFromGoogleMaps()
    participant P45 as .suppress()
    participant P46 as .getAccountStatus()
    participant P47 as .processPendingDispatches()
    participant P48 as .enrichLead()
    participant P49 as .ensurePdfForLead()
    participant P50 as .flagAndMoveLeadToInvalidList()
    participant P51 as .createPost()
    participant P52 as .publishExistingPost()
    participant P53 as .scheduleBatchDispatch()
    participant P54 as .executeLinkedInDispatch()
    participant P55 as .runLocalAudit()
    participant P56 as runCsvTests()
    participant P57 as runSuppressionTests()
    participant P58 as .enqueueDraft()
    participant P59 as .batchVerifyAndUpdateLeads()
    participant P60 as .checkDailyReset()
    participant P61 as usePostgresAuthState()
    participant P62 as .checkAndResetQuotas()
    participant P63 as .getAllAccounts()
    participant P64 as .processScheduledPosts()
    participant P65 as .executeFacebookDispatch()
    participant P66 as .executeInstagramDispatch()
    participant P67 as .updateSettings()
    participant P68 as .reapStaleSendingClaims()
    participant P69 as .checkReportDeliveryWatchdog()
    participant P70 as .verifyAndSend()
    participant P71 as .scrapeSingleLead()
    participant P72 as .retryFailure()
    participant P73 as .getAccountCredentials()
    participant P74 as .getPosts()
    participant P75 as .getProspectCommentTasks()
    participant P76 as .approveAndPostComment()
    participant P77 as .addProspectPostToMonitor()
    participant P78 as .seedSampleProspectPosts()
    participant P79 as .deleteFailedDispatches()
    participant P80 as .acquireLeaderLock()
    participant P81 as .assignLeadToSlot()
    participant P82 as .convertLeadToClient()
    participant P83 as runInboundIntentTests()
    participant P84 as run28DayRetentionCleanup()
    participant P85 as .enqueueDraft()
    participant P86 as .handleInboundWebhook()
    participant P87 as runMigrations()
    participant P88 as migrateWebsiteAndCountry()
    participant P89 as addSuppressionAndSequences()
    participant P90 as handleUpdateClient()
    participant P91 as .updateSettings()
    participant P92 as .handleInboundLeadMessage()
    participant P93 as .dismissUnmatchedEmail()
    participant P94 as .clearAllUnmatchedEmails()
    participant P95 as .resolveFailure()
    participant P96 as .connectAccount()
    participant P97 as .disconnectAccount()
    participant P98 as .deleteAccount()
    participant P99 as .confirmManualPost()
    participant P100 as .updatePost()
    participant P101 as .advanceStep()
    participant P102 as .delayForOoo()
    participant P103 as .updateStatusForLead()
    participant P104 as .releaseLeaderLock()
    participant P105 as .resumeCircuitBreaker()
    participant P106 as .saveCommandHistory()
    participant P107 as runSchedulerTests()
    participant P108 as .markDraftSent()
    participant P109 as .markDraftSent()
    participant P110 as runMigration()
    participant P111 as seedRealisticCrmData()
    participant P112 as migrateListsAndEnforceSingleEntity()
    participant P113 as addLinkedInPublishingColumns()
    participant P114 as migrateLocationAndCleanWebsites()
    participant P115 as addScheduledDispatchesTable()
    participant P116 as addLinkedInTables()
    participant P117 as migrateBatchesAndRetention()
    participant P118 as addSeenRepliedToMessages()
    participant P119 as addMultiChannelScheduling()
    participant P120 as addManualReviewStatus()
    participant P121 as migrate()
    participant P122 as runSeed()
    participant P123 as addInboundEmailSyncTable()
    participant P124 as addWhatsAppPostgresSessionTable()
    participant P125 as migrate()
    participant P126 as addInboxRotationAndTrigramIndexes()
    participant P127 as addExtremeAutomation()
    participant P128 as addChannelAutoAssignmentTrigger()
    participant P129 as addDealsTasksAndActivities()
    participant P130 as addAutomatedCadenceAndChannelLists()
    participant P131 as addAiCommandHistoryTable()
    participant P132 as .unsuppress()
    participant P133 as .deleteInbox()
    participant P134 as .addAccount()
    participant P135 as .deletePost()
    participant P136 as .skipCommentTask()
    participant P137 as .getDispatches()
    participant P138 as .cancelDispatch()
    participant P139 as .retryDispatch()
    participant P140 as .deleteDispatches()
    participant P141 as .enrollLead()
    participant P142 as .clearCommandHistory()
    participant P143 as .processClientFollowUps()
    participant P144 as .getEmailCopy()
    participant P145 as assertNotProduction()
    participant P146 as computeProductionDatabaseMd5()
    participant P147 as assertProductionImmutability()
    participant P148 as .getMockSentLog()
    participant P149 as .setMockMode()
    participant P150 as .clearMockSentLog()
    participant P151 as .getPostalAddress()
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
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P26: calls
    P26-->>- P1: return
    P1->>+ P27: calls
    P27-->>- P1: return
    P1->>+ P28: calls
    P28-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P29: calls
    P29-->>- P1: return
    P1->>+ P30: calls
    P30-->>- P1: return
    P1->>+ P31: calls
    P31-->>- P1: return
    P1->>+ P32: calls
    P32-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P33: calls
    P33-->>- P1: return
    P1->>+ P34: calls
    P34-->>- P1: return
    P1->>+ P35: calls
    P35-->>- P1: return
    P1->>+ P36: calls
    P36-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P38: calls
    P38-->>- P1: return
    P1->>+ P39: calls
    P39-->>- P1: return
    P1->>+ P40: calls
    P40-->>- P1: return
    P1->>+ P41: calls
    P41-->>- P1: return
    P1->>+ P42: calls
    P42-->>- P1: return
    P1->>+ P43: calls
    P43-->>- P1: return
    P1->>+ P44: calls
    P44-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P48: calls
    P48-->>- P1: return
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
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P69: calls
    P69-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P72: calls
    P72-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P1->>+ P74: calls
    P74-->>- P1: return
    P1->>+ P75: calls
    P75-->>- P1: return
    P1->>+ P76: calls
    P76-->>- P1: return
    P1->>+ P77: calls
    P77-->>- P1: return
    P1->>+ P78: calls
    P78-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P80: calls
    P80-->>- P1: return
    P1->>+ P81: calls
    P81-->>- P1: return
    P1->>+ P82: calls
    P82-->>- P1: return
    P1->>+ P83: calls
    P83-->>- P1: return
    P1->>+ P84: calls
    P84-->>- P1: return
    P1->>+ P85: calls
    P85-->>- P1: return
    P1->>+ P86: calls
    P86-->>- P1: return
    P1->>+ P87: calls
    P87-->>- P1: return
    P1->>+ P88: calls
    P88-->>- P1: return
    P1->>+ P89: calls
    P89-->>- P1: return
    P1->>+ P90: calls
    P90-->>- P1: return
    P1->>+ P91: calls
    P91-->>- P1: return
    P1->>+ P92: calls
    P92-->>- P1: return
    P1->>+ P25: calls
    P25-->>- P1: return
    P1->>+ P93: calls
    P93-->>- P1: return
    P1->>+ P94: calls
    P94-->>- P1: return
    P1->>+ P95: calls
    P95-->>- P1: return
    P1->>+ P96: calls
    P96-->>- P1: return
    P1->>+ P97: calls
    P97-->>- P1: return
    P1->>+ P98: calls
    P98-->>- P1: return
    P1->>+ P99: calls
    P99-->>- P1: return
    P1->>+ P100: calls
    P100-->>- P1: return
    P1->>+ P101: calls
    P101-->>- P1: return
    P1->>+ P102: calls
    P102-->>- P1: return
    P1->>+ P103: calls
    P103-->>- P1: return
    P1->>+ P104: calls
    P104-->>- P1: return
    P1->>+ P105: calls
    P105-->>- P1: return
    P1->>+ P106: calls
    P106-->>- P1: return
    P1->>+ P107: calls
    P107-->>- P1: return
    P1->>+ P108: calls
    P108-->>- P1: return
    P1->>+ P109: calls
    P109-->>- P1: return
    P1->>+ P110: calls
    P110-->>- P1: return
    P1->>+ P111: calls
    P111-->>- P1: return
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
    P1->>+ P121: calls
    P121-->>- P1: return
    P1->>+ P122: calls
    P122-->>- P1: return
    P1->>+ P123: calls
    P123-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
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
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P29: calls
    P29-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
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
```

## Connections by Relation

### calls
- [[query()]] `INFERRED`
- [[.sendNextStageToLead()]] `INFERRED`
- [[.getEmailCopy()]] `INFERRED`
- [[.isSuppressed()]] `INFERRED`
- [[.suppress()]] `INFERRED`
- [[assertNotProduction()]] `INFERRED`
- [[computeProductionDatabaseMd5()]] `INFERRED`
- [[assertProductionImmutability()]] `INFERRED`
- [[.getMockSentLog()]] `INFERRED`
- [[.setMockMode()]] `INFERRED`
- [[.clearMockSentLog()]] `INFERRED`
- [[.getPostalAddress()]] `INFERRED`

### contains
- [[testItem10EmailAndUnsubscribe.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*