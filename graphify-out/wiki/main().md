# main()

> God node · 15 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/scripts/testB23Organic100Leads.ts](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/scripts/testB23Organic100Leads.ts#L11)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as main()
    participant P1 as query()
    participant P2 as .processGlobalTick()
    participant P3 as test
    participant P4 as map
    participant P5 as .get()
    participant P6 as .sendNextStageToLead()
    participant P7 as .set()
    participant P8 as .triggerAuditForLead()
    participant P9 as logPipeline()
    participant P10 as .getSettings()
    participant P11 as runSeniorQA()
    participant P12 as .updateSettings()
    participant P13 as logPipelineError()
    participant P14 as main()
    participant P15 as .hasValidWebsite()
    participant P16 as .ensureLeadAuditReady()
    participant P17 as .isolateFailedLead()
    participant P18 as .autoAssignUnassignedLeads()
    participant P19 as .handleDispatchFailure()
    participant P20 as .isSuppressed()
    participant P21 as .logFailure()
    participant P22 as run()
    participant P23 as .computeGridState()
    participant P24 as .isolateAuditFailure()
    participant P25 as formatDuration()
    participant P26 as logPipelineThrottled()
    participant P27 as validateAuditAsset()
    participant P28 as .ensurePdfForLead()
    participant P29 as .acquireLeaderLock()
    participant P30 as .dispatchRollingAudits()
    participant P31 as .getMailboxForSlot()
    participant P32 as isValidPdfFile()
    participant P33 as .clearDeletedOrInvalidSlotAssignments()
    participant P34 as .reapStaleSendingClaims()
    participant P35 as .getTurnStatesMap()
    participant P36 as .recordSlotSendHistory()
    participant P37 as clearPipelineThrottle()
    participant P38 as resolveRecipientTimezone()
    participant P39 as isWithinRecipientWindow()
    participant P40 as logSlotStep()
    participant P41 as .claimSlotInFlight()
    participant P42 as .releaseSlotInFlight()
    participant P43 as .sendEmail()
    participant P44 as .executeEmailDispatch()
    participant P45 as .processImportedLeads()
    participant P46 as main()
    participant P47 as .scheduleListDispatch()
    participant P48 as .getSlotsStatus()
    participant P49 as .syncInboundEmails()
    participant P50 as .importScrapedLeads()
    participant P51 as .executeWhatsAppDispatch()
    participant P52 as .runLocalAudit()
    participant P53 as .autoAssignLeads()
    participant P54 as .scheduleBatchDispatch()
    participant P55 as run()
    participant P56 as .submitContactForm()
    participant P57 as .runEnrichmentCycle()
    participant P58 as main()
    participant P59 as main()
    participant P60 as .detectAndSaveFormForLead()
    participant P61 as .syncFromGoogleMaps()
    participant P62 as .suppress()
    participant P63 as .processInboundMessage()
    participant P64 as .enrichLead()
    participant P65 as .flagAndMoveLeadToInvalidList()
    participant P66 as .releaseDispatch()
    participant P67 as .togglePause()
    participant P68 as .persistCompletedAuditResult()
    participant P69 as .processPendingDispatches()
    participant P70 as runCsvTests()
    participant P71 as runSuppressionTests()
    participant P72 as .verifyAndSend()
    participant P73 as .batchVerifyAndUpdateLeads()
    participant P74 as .checkDailyReset()
    participant P75 as usePostgresAuthState()
    participant P76 as .retryFailure()
    participant P77 as .resetLastSlotSent()
    participant P78 as .checkReportDeliveryWatchdog()
    participant P79 as .testFiveSlots()
    participant P80 as performSoftDelete()
    participant P81 as .scrapeSingleLead()
    participant P82 as .deleteFailedDispatches()
    participant P83 as .releaseLeaderLock()
    participant P84 as .assignLeadToSlot()
    participant P85 as .convertLeadToClient()
    participant P86 as withTransaction()
    participant P87 as runInboundIntentTests()
    participant P88 as run28DayRetentionCleanup()
    participant P89 as .handleInboundWebhook()
    participant P90 as runMigrations()
    participant P91 as migrateWebsiteAndCountry()
    participant P92 as addSuppressionAndSequences()
    participant P93 as handleUpdateClient()
    participant P94 as .updateSettings()
    participant P95 as .handleInboundLeadMessage()
    participant P96 as .recordDispatch()
    participant P97 as .dismissUnmatchedEmail()
    participant P98 as .clearAllUnmatchedEmails()
    participant P99 as .resolveFailure()
    participant P100 as .deleteFailedLead()
    participant P101 as .cancelDispatch()
    participant P102 as .retryDispatch()
    participant P103 as .advanceStep()
    participant P104 as .delayForOoo()
    participant P105 as .updateStatusForLead()
    participant P106 as .clearStaleInFlightLocks()
    participant P107 as .resumeCircuitBreaker()
    participant P108 as .terminateSlotSchedule()
    participant P109 as .saveCommandHistory()
    participant P110 as runSchedulerTests()
    participant P111 as runMigration()
    participant P112 as seedRealisticCrmData()
    participant P113 as migrateListsAndEnforceSingleEntity()
    participant P114 as migrateLocationAndCleanWebsites()
    participant P115 as addScheduledDispatchesTable()
    participant P116 as migrateBatchesAndRetention()
    participant P117 as addSeenRepliedToMessages()
    participant P118 as addMultiChannelScheduling()
    participant P119 as addManualReviewStatus()
    participant P120 as runSeed()
    participant P121 as addInboundEmailSyncTable()
    participant P122 as addWhatsAppPostgresSessionTable()
    participant P123 as migrate()
    participant P124 as addInboxRotationAndTrigramIndexes()
    participant P125 as addExtremeAutomation()
    participant P126 as addChannelAutoAssignmentTrigger()
    participant P127 as addDealsTasksAndActivities()
    participant P128 as addAutomatedCadenceAndChannelLists()
    participant P129 as addAiCommandHistoryTable()
    participant P130 as .unsuppress()
    participant P131 as .deleteInbox()
    participant P132 as .getDispatches()
    participant P133 as .deleteDispatches()
    participant P134 as .enrollLead()
    participant P135 as .clearCommandHistory()
    participant P136 as .processClientFollowUps()
    participant P137 as assertNotProduction()
    participant P138 as computeProductionDatabaseMd5()
    participant P139 as .getMockSentLog()
    participant P140 as assertProductionImmutability()
    participant P141 as .clearMockSentLog()
    participant P142 as .setMockMode()
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
    P2->>+ P0: calls
    P0-->>- P2: return
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
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P43: calls
    P43-->>- P1: return
    P1->>+ P8: calls
    P8-->>- P1: return
    P1->>+ P11: calls
    P11-->>- P1: return
    P1->>+ P44: calls
    P44-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P12: calls
    P12-->>- P1: return
    P1->>+ P14: calls
    P14-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P48: calls
    P48-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P17: calls
    P17-->>- P1: return
    P1->>+ P20: calls
    P20-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
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
    P1->>+ P22: calls
    P22-->>- P1: return
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
    P1->>+ P24: calls
    P24-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P28: calls
    P28-->>- P1: return
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
    P1->>+ P29: calls
    P29-->>- P1: return
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
    P1->>+ P34: calls
    P34-->>- P1: return
    P1->>+ P36: calls
    P36-->>- P1: return
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
    P1->>+ P41: calls
    P41-->>- P1: return
    P1->>+ P42: calls
    P42-->>- P1: return
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
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P7: calls
    P7-->>- P0: return
    P0->>+ P8: calls
    P8-->>- P0: return
    P0->>+ P12: calls
    P12-->>- P0: return
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
    P0->>+ P77: calls
    P77-->>- P0: return
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
```

## Connections by Relation

### calls
- [[query()]] `INFERRED`
- [[.processGlobalTick()]] `INFERRED`
- [[.get()]] `INFERRED`
- [[.set()]] `INFERRED`
- [[.triggerAuditForLead()]] `INFERRED`
- [[.updateSettings()]] `INFERRED`
- [[assertNotProduction()]] `INFERRED`
- [[computeProductionDatabaseMd5()]] `INFERRED`
- [[.getMockSentLog()]] `INFERRED`
- [[assertProductionImmutability()]] `INFERRED`
- [[.clearMockSentLog()]] `INFERRED`
- [[.resetLastSlotSent()]] `INFERRED`
- [[.checkReportDeliveryWatchdog()]] `INFERRED`
- [[.setMockMode()]] `INFERRED`

### contains
- [[testB23Organic100Leads.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*