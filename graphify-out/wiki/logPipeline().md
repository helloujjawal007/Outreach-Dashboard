# logPipeline()

> God node · 20 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/utils/pipelineLogger.ts](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/utils/pipelineLogger.ts#L67)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as logPipeline()
    participant P1 as .processGlobalTick()
    participant P2 as query()
    participant P3 as .sendNextStageToLead()
    participant P4 as .sendEmail()
    participant P5 as .triggerAuditForLead()
    participant P6 as runSeniorQA()
    participant P7 as .executeEmailDispatch()
    participant P8 as .processImportedLeads()
    participant P9 as main()
    participant P10 as .updateSettings()
    participant P11 as main()
    participant P12 as main()
    participant P13 as .scheduleListDispatch()
    participant P14 as .getSlotsStatus()
    participant P15 as .syncInboundEmails()
    participant P16 as .isolateFailedLead()
    participant P17 as .isSuppressed()
    participant P18 as .importScrapedLeads()
    participant P19 as .autoAssignUnassignedLeads()
    participant P20 as .handleDispatchFailure()
    participant P21 as .executeWhatsAppDispatch()
    participant P22 as .runLocalAudit()
    participant P23 as .autoAssignLeads()
    participant P24 as .scheduleBatchDispatch()
    participant P25 as run()
    participant P26 as .submitContactForm()
    participant P27 as .runEnrichmentCycle()
    participant P28 as run()
    participant P29 as main()
    participant P30 as main()
    participant P31 as .detectAndSaveFormForLead()
    participant P32 as .syncFromGoogleMaps()
    participant P33 as .suppress()
    participant P34 as .processInboundMessage()
    participant P35 as .isolateAuditFailure()
    participant P36 as .enrichLead()
    participant P37 as .ensurePdfForLead()
    participant P38 as .flagAndMoveLeadToInvalidList()
    participant P39 as .releaseDispatch()
    participant P40 as .togglePause()
    participant P41 as .persistCompletedAuditResult()
    participant P42 as .processPendingDispatches()
    participant P43 as runCsvTests()
    participant P44 as runSuppressionTests()
    participant P45 as .verifyAndSend()
    participant P46 as .batchVerifyAndUpdateLeads()
    participant P47 as .checkDailyReset()
    participant P48 as usePostgresAuthState()
    participant P49 as .retryFailure()
    participant P50 as .acquireLeaderLock()
    participant P51 as .resetLastSlotSent()
    participant P52 as .checkReportDeliveryWatchdog()
    participant P53 as .testFiveSlots()
    participant P54 as performSoftDelete()
    participant P55 as .scrapeSingleLead()
    participant P56 as .deleteFailedDispatches()
    participant P57 as .releaseLeaderLock()
    participant P58 as .assignLeadToSlot()
    participant P59 as .reapStaleSendingClaims()
    participant P60 as .recordSlotSendHistory()
    participant P61 as .convertLeadToClient()
    participant P62 as withTransaction()
    participant P63 as runInboundIntentTests()
    participant P64 as run28DayRetentionCleanup()
    participant P65 as .handleInboundWebhook()
    participant P66 as runMigrations()
    participant P67 as migrateWebsiteAndCountry()
    participant P68 as addSuppressionAndSequences()
    participant P69 as handleUpdateClient()
    participant P70 as .updateSettings()
    participant P71 as .handleInboundLeadMessage()
    participant P72 as .recordDispatch()
    participant P73 as .dismissUnmatchedEmail()
    participant P74 as .clearAllUnmatchedEmails()
    participant P75 as .resolveFailure()
    participant P76 as .deleteFailedLead()
    participant P77 as .cancelDispatch()
    participant P78 as .retryDispatch()
    participant P79 as .advanceStep()
    participant P80 as .delayForOoo()
    participant P81 as .updateStatusForLead()
    participant P82 as .clearStaleInFlightLocks()
    participant P83 as .claimSlotInFlight()
    participant P84 as .releaseSlotInFlight()
    participant P85 as .resumeCircuitBreaker()
    participant P86 as .terminateSlotSchedule()
    participant P87 as .saveCommandHistory()
    participant P88 as runSchedulerTests()
    participant P89 as runMigration()
    participant P90 as seedRealisticCrmData()
    participant P91 as migrateListsAndEnforceSingleEntity()
    participant P92 as migrateLocationAndCleanWebsites()
    participant P93 as addScheduledDispatchesTable()
    participant P94 as migrateBatchesAndRetention()
    participant P95 as addSeenRepliedToMessages()
    participant P96 as addMultiChannelScheduling()
    participant P97 as addManualReviewStatus()
    participant P98 as runSeed()
    participant P99 as addInboundEmailSyncTable()
    participant P100 as addWhatsAppPostgresSessionTable()
    participant P101 as migrate()
    participant P102 as addInboxRotationAndTrigramIndexes()
    participant P103 as addExtremeAutomation()
    participant P104 as addChannelAutoAssignmentTrigger()
    participant P105 as addDealsTasksAndActivities()
    participant P106 as addAutomatedCadenceAndChannelLists()
    participant P107 as addAiCommandHistoryTable()
    participant P108 as .unsuppress()
    participant P109 as .deleteInbox()
    participant P110 as .getDispatches()
    participant P111 as .deleteDispatches()
    participant P112 as .enrollLead()
    participant P113 as .clearCommandHistory()
    participant P114 as .processClientFollowUps()
    participant P115 as test
    participant P116 as map
    participant P117 as .get()
    participant P118 as .set()
    participant P119 as .getSettings()
    participant P120 as logPipelineError()
    participant P121 as .hasValidWebsite()
    participant P122 as .ensureLeadAuditReady()
    participant P123 as .logFailure()
    participant P124 as .computeGridState()
    participant P125 as formatDuration()
    participant P126 as logPipelineThrottled()
    participant P127 as validateAuditAsset()
    participant P128 as .dispatchRollingAudits()
    participant P129 as .getMailboxForSlot()
    participant P130 as isValidPdfFile()
    participant P131 as .clearDeletedOrInvalidSlotAssignments()
    participant P132 as .getTurnStatesMap()
    participant P133 as clearPipelineThrottle()
    participant P134 as resolveRecipientTimezone()
    participant P135 as isWithinRecipientWindow()
    participant P136 as logSlotStep()
    participant P137 as .generateAuditPdf()
    participant P138 as .scheduleSingleDispatch()
    participant P139 as .searchGmb()
    participant P140 as formatClockTime()
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
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
    P1->>+ P11: calls
    P11-->>- P1: return
    P1->>+ P121: calls
    P121-->>- P1: return
    P1->>+ P122: calls
    P122-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P20: calls
    P20-->>- P1: return
    P1->>+ P17: calls
    P17-->>- P1: return
    P1->>+ P123: calls
    P123-->>- P1: return
    P1->>+ P28: calls
    P28-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P35: calls
    P35-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P1->>+ P134: calls
    P134-->>- P1: return
    P1->>+ P135: calls
    P135-->>- P1: return
    P1->>+ P136: calls
    P136-->>- P1: return
    P1->>+ P83: calls
    P83-->>- P1: return
    P1->>+ P84: calls
    P84-->>- P1: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P4: calls
    P4-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P8: calls
    P8-->>- P0: return
    P0->>+ P10: calls
    P10-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P15: calls
    P15-->>- P0: return
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P19: calls
    P19-->>- P0: return
    P0->>+ P22: calls
    P22-->>- P0: return
    P0->>+ P23: calls
    P23-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P24: calls
    P24-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P126: calls
    P126-->>- P0: return
    P0->>+ P40: calls
    P40-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
```

## Connections by Relation

### calls
- [[.processGlobalTick()]] `INFERRED`
- [[.sendNextStageToLead()]] `INFERRED`
- [[.sendEmail()]] `INFERRED`
- [[.triggerAuditForLead()]] `INFERRED`
- [[.processImportedLeads()]] `INFERRED`
- [[.updateSettings()]] `INFERRED`
- [[.generateAuditPdf()]] `INFERRED`
- [[.scheduleListDispatch()]] `INFERRED`
- [[.syncInboundEmails()]] `INFERRED`
- [[.importScrapedLeads()]] `INFERRED`
- [[.autoAssignUnassignedLeads()]] `INFERRED`
- [[.runLocalAudit()]] `INFERRED`
- [[.autoAssignLeads()]] `INFERRED`
- [[.scheduleSingleDispatch()]] `INFERRED`
- [[.scheduleBatchDispatch()]] `INFERRED`
- [[.searchGmb()]] `INFERRED`
- [[logPipelineThrottled()]] `EXTRACTED`
- [[.togglePause()]] `INFERRED`
- [[formatClockTime()]] `EXTRACTED`

### contains
- [[pipelineLogger.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*