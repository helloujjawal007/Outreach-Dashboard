# query()

> God node · 114 connections · [/Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts](file:///Users/ujjawal/Documents/ChatBot/Outreach-Dashboard/server/src/config/db.ts#L43)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as query()
    participant P1 as .processGlobalTick()
    participant P2 as test
    participant P3 as .sendEmail()
    participant P4 as .getEmailCopy()
    participant P5 as runSeniorQA()
    participant P6 as .executeEmailDispatch()
    participant P7 as .hasValidWebsite()
    participant P8 as .isolateFailedLead()
    participant P9 as .isSuppressed()
    participant P10 as .handleDispatchFailure()
    participant P11 as .generateEmail()
    participant P12 as .executeFunctionality()
    participant P13 as .normalizeGmbWebsiteUrl()
    participant P14 as .evaluate()
    participant P15 as .fetchGoogleProfile()
    participant P16 as .testTdConnection()
    participant P17 as .runEnrichmentCycle()
    participant P18 as .processInboundMessage()
    participant P19 as cleanSiteUrl()
    participant P20 as ensurePhoneWithCountryCode()
    participant P21 as .buildAuditHtml()
    participant P22 as .analyzeAudit()
    participant P23 as .normalizeAuditUrl()
    participant P24 as .runLocalAudit()
    participant P25 as .classifyInboundReply()
    participant P26 as .verifyWebsiteLive()
    participant P27 as .validateAuditPdf()
    participant P28 as cleanSiteUrl()
    participant P29 as .crawlSiteForAddress()
    participant P30 as .scrapeLeadDetails()
    participant P31 as .buildGreeting()
    participant P32 as .buildTdAuditRequestUrl()
    participant P33 as classifySmtpError()
    participant P34 as .validateSyntax()
    participant P35 as .isAutomatedOrMarketingEmail()
    participant P36 as .getPostalAddress()
    participant P37 as isMapsUrl()
    participant P38 as resolveCountryCallingCode()
    participant P39 as .check24HourWindow()
    participant P40 as migrateWebsiteAndCountry()
    participant P41 as .parseFormFromHtml()
    participant P42 as .sanitizeTokens()
    participant P43 as .verifyCompliance()
    participant P44 as .inferCategory()
    participant P45 as .dispatchFunctionality()
    participant P46 as .isValidBusinessEmail()
    participant P47 as .extractCleanReply()
    participant P48 as .cleanLocation()
    participant P49 as .cleanCategory()
    participant P50 as sanitizeCsvFormula()
    participant P51 as cleanHostValue()
    participant P52 as cleanImapHostValue()
    participant P53 as sanitizeCsvFormula()
    participant P54 as calculateDealValue()
    participant P55 as .humanizeFinding()
    participant P56 as map
    participant P57 as .get()
    participant P58 as .sendNextStageToLead()
    participant P59 as .set()
    participant P60 as .triggerAuditForLead()
    participant P61 as logPipeline()
    participant P62 as .getSettings()
    participant P63 as .updateSettings()
    participant P64 as main()
    participant P65 as logPipelineError()
    participant P66 as main()
    participant P67 as .ensureLeadAuditReady()
    participant P68 as .autoAssignUnassignedLeads()
    participant P69 as .logFailure()
    participant P70 as run()
    participant P71 as .computeGridState()
    participant P72 as .isolateAuditFailure()
    participant P73 as formatDuration()
    participant P74 as logPipelineThrottled()
    participant P75 as validateAuditAsset()
    participant P76 as .ensurePdfForLead()
    participant P77 as .acquireLeaderLock()
    participant P78 as .dispatchRollingAudits()
    participant P79 as .getMailboxForSlot()
    participant P80 as isValidPdfFile()
    participant P81 as .clearDeletedOrInvalidSlotAssignments()
    participant P82 as .reapStaleSendingClaims()
    participant P83 as .getTurnStatesMap()
    participant P84 as .recordSlotSendHistory()
    participant P85 as clearPipelineThrottle()
    participant P86 as resolveRecipientTimezone()
    participant P87 as isWithinRecipientWindow()
    participant P88 as logSlotStep()
    participant P89 as .claimSlotInFlight()
    participant P90 as .releaseSlotInFlight()
    participant P91 as .processImportedLeads()
    participant P92 as main()
    participant P93 as .scheduleListDispatch()
    participant P94 as .getSlotsStatus()
    participant P95 as .syncInboundEmails()
    participant P96 as .importScrapedLeads()
    participant P97 as .executeWhatsAppDispatch()
    participant P98 as .runLocalAudit()
    participant P99 as .autoAssignLeads()
    participant P100 as .scheduleBatchDispatch()
    participant P101 as run()
    participant P102 as .submitContactForm()
    participant P103 as main()
    participant P104 as main()
    participant P105 as .detectAndSaveFormForLead()
    participant P106 as .syncFromGoogleMaps()
    participant P107 as .suppress()
    participant P108 as .enrichLead()
    participant P109 as .flagAndMoveLeadToInvalidList()
    participant P110 as .releaseDispatch()
    participant P111 as .togglePause()
    participant P112 as .persistCompletedAuditResult()
    participant P113 as .processPendingDispatches()
    participant P114 as runCsvTests()
    participant P115 as runSuppressionTests()
    participant P116 as .verifyAndSend()
    participant P117 as .batchVerifyAndUpdateLeads()
    participant P118 as .checkDailyReset()
    participant P119 as usePostgresAuthState()
    participant P120 as .retryFailure()
    participant P121 as .resetLastSlotSent()
    participant P122 as .checkReportDeliveryWatchdog()
    participant P123 as .testFiveSlots()
    participant P124 as performSoftDelete()
    participant P125 as .scrapeSingleLead()
    participant P126 as .deleteFailedDispatches()
    participant P127 as .releaseLeaderLock()
    participant P128 as .assignLeadToSlot()
    participant P129 as .convertLeadToClient()
    participant P130 as withTransaction()
    participant P131 as runInboundIntentTests()
    participant P132 as run28DayRetentionCleanup()
    participant P133 as .handleInboundWebhook()
    participant P134 as runMigrations()
    participant P135 as addSuppressionAndSequences()
    participant P136 as handleUpdateClient()
    participant P137 as .updateSettings()
    participant P138 as .handleInboundLeadMessage()
    participant P139 as .recordDispatch()
    participant P140 as .dismissUnmatchedEmail()
    participant P141 as .clearAllUnmatchedEmails()
    participant P142 as .resolveFailure()
    participant P143 as .deleteFailedLead()
    participant P144 as .cancelDispatch()
    participant P145 as .retryDispatch()
    participant P146 as .advanceStep()
    participant P147 as .delayForOoo()
    participant P148 as .updateStatusForLead()
    participant P149 as .clearStaleInFlightLocks()
    participant P150 as .resumeCircuitBreaker()
    participant P151 as .terminateSlotSchedule()
    participant P152 as .saveCommandHistory()
    participant P153 as runSchedulerTests()
    participant P154 as runMigration()
    participant P155 as seedRealisticCrmData()
    participant P156 as migrateListsAndEnforceSingleEntity()
    participant P157 as migrateLocationAndCleanWebsites()
    participant P158 as addScheduledDispatchesTable()
    participant P159 as migrateBatchesAndRetention()
    participant P160 as addSeenRepliedToMessages()
    participant P161 as addMultiChannelScheduling()
    participant P162 as addManualReviewStatus()
    participant P163 as runSeed()
    participant P164 as addInboundEmailSyncTable()
    participant P165 as addWhatsAppPostgresSessionTable()
    participant P166 as migrate()
    participant P167 as addInboxRotationAndTrigramIndexes()
    participant P168 as addExtremeAutomation()
    participant P169 as addChannelAutoAssignmentTrigger()
    participant P170 as addDealsTasksAndActivities()
    participant P171 as addAutomatedCadenceAndChannelLists()
    participant P172 as addAiCommandHistoryTable()
    participant P173 as .unsuppress()
    participant P174 as .deleteInbox()
    participant P175 as .getDispatches()
    participant P176 as .deleteDispatches()
    participant P177 as .enrollLead()
    participant P178 as .clearCommandHistory()
    participant P179 as .processClientFollowUps()
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
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P66: calls
    P66-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P67: calls
    P67-->>- P1: return
    P1->>+ P8: calls
    P8-->>- P1: return
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
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
    P0->>+ P58: calls
    P58-->>- P0: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P60: calls
    P60-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P6: calls
    P6-->>- P0: return
    P0->>+ P91: calls
    P91-->>- P0: return
    P0->>+ P64: calls
    P64-->>- P0: return
    P0->>+ P63: calls
    P63-->>- P0: return
    P0->>+ P66: calls
    P66-->>- P0: return
    P0->>+ P92: calls
    P92-->>- P0: return
    P0->>+ P93: calls
    P93-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P95: calls
    P95-->>- P0: return
    P0->>+ P8: calls
    P8-->>- P0: return
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P68: calls
    P68-->>- P0: return
    P0->>+ P10: calls
    P10-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P98: calls
    P98-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P17: calls
    P17-->>- P0: return
    P0->>+ P70: calls
    P70-->>- P0: return
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
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P72: calls
    P72-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P76: calls
    P76-->>- P0: return
    P0->>+ P109: calls
    P109-->>- P0: return
    P0->>+ P110: calls
    P110-->>- P0: return
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
    P0->>+ P77: calls
    P77-->>- P0: return
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
    P0->>+ P128: calls
    P128-->>- P0: return
    P0->>+ P82: calls
    P82-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
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
    P0->>+ P40: calls
    P40-->>- P0: return
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
    P0->>+ P89: calls
    P89-->>- P0: return
    P0->>+ P90: calls
    P90-->>- P0: return
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
    P0->>+ P179: calls
    P179-->>- P0: return
```

## Connections by Relation

### calls
- [[.processGlobalTick()]] `INFERRED`
- [[.sendNextStageToLead()]] `INFERRED`
- [[.sendEmail()]] `INFERRED`
- [[.triggerAuditForLead()]] `INFERRED`
- [[runSeniorQA()]] `INFERRED`
- [[.executeEmailDispatch()]] `INFERRED`
- [[.processImportedLeads()]] `INFERRED`
- [[main()]] `INFERRED`
- [[.updateSettings()]] `INFERRED`
- [[main()]] `INFERRED`
- [[main()]] `INFERRED`
- [[.scheduleListDispatch()]] `INFERRED`
- [[.getSlotsStatus()]] `INFERRED`
- [[.syncInboundEmails()]] `INFERRED`
- [[.isolateFailedLead()]] `INFERRED`
- [[.isSuppressed()]] `INFERRED`
- [[.importScrapedLeads()]] `INFERRED`
- [[.autoAssignUnassignedLeads()]] `INFERRED`
- [[.handleDispatchFailure()]] `INFERRED`
- [[.executeWhatsAppDispatch()]] `INFERRED`

### contains
- [[db.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*