import json, os, sys
BASE = os.path.join(os.environ["HOME"], "mnt/stockmarket/data/runs/learn-and-automate/x-sureshkbn/topics/pead")
P = "xp_x-posts-capture_sureshkbn__"

def U(kind, stmt, verb, did, stage="n/a", trig="n/a", company=None, metrics=None, horizon=None, cond=None, expl="explicit"):
    return {"kind": kind, "statement": stmt, "verbatim": verb, "docIds": [P + did], "stage": stage,
            "triggerType": trig, "company": company, "metrics": metrics, "horizon": horizon,
            "conditions": cond, "explicitness": expl, "fromMedia": False}

def R(kind, stmt, verb, did, trig="n/a", company=None, metrics=None, horizon=None, cond=None):
    return U(kind, stmt, verb, did, trig=trig, company=company, metrics=metrics, horizon=horizon, cond=cond, expl="inferred")

C = {}
C["pead-t2-c001"] = [
 U("entry_exit","Wait for results and understand them fully before taking a position; do not enter before results.","wait for results after understanding completley take a call","00d410ea",stage="pre-result"),
 U("monitor","After a PEAD failure, wait for the next quarter result to confirm before re-engaging.","pead failed in Q1FY27 but waiting for Q2 confirmation","8bda9563",stage="q+1"),
 U("pitfall","The hard part of PEAD is recognising when post-result price action fails to sustain.","tricky part is where the PEAD action could NOT sustain","ea2719cc"),
 U("expectation","A good concall can be unrewarding if the upside is already priced in; check that first.","is it not priced in ?","f6c12965"),
 U("reaction_signal","The stock reacts to each quarterly business update and results print, so the pattern recurs.","This is case every quarter after business update and after results","de1a59e5",cond="jewellery stocks"),
 U("checklist_item","Read quarterly concalls and guidance, and model FY27/FY28 sales, PAT and EPS guidance.","learn and read quartely calls and guidnace","054c566d",horizon="FY27-FY28"),
 U("checklist_item","Check valuation against the stock 1 and 3 year median P/E and the size of the order impact.","What is 1 r 3 years median p/e","bb492b6d"),
 U("reaction_signal","Price action after a result cannot always be explained; the market is the ultimate truth.","market is ultimate truth","0b81b122"),
 U("guidance_signal","A result is worth acting on only if the concall is good.","no way unless call is good","adac121a"),
 U("guidance_signal","Listen to the concall before judging a result that is good but not exceptional.","listem call","41621cf6"),
 U("case","Most of his PEAD calls worked (70-80%) when he entered early and momentum sustained.","most of PEAD worked 70-80% and entered early and momentum sustained","b2c0aa48"),
 U("result_quality","Margin expansion for a vendor tied to a dominant OEM may be capped by design, not capability.","Margin expansion in such cases is capped by design, not by capability.","3cffdd11",trig="margin"),
 U("pitfall","Trading PEAD off a generic result-rating summary is how one should not trade PEAD.","This is exactly how one should not do trade r PEAD","65bb230f"),
 U("pitfall","Check the details; many earnings blowouts have shortcuts behind them.","Check details many shortcuts for earnings blowout","793d0cdd"),
 U("expectation","In a bull market a good result looks like PEAD, but once valuations are at their best the drift is priced in.","in bullmarket it is pead , now it already trading at best val","9caaac8e"),
 U("result_quality","Not all results are excellent; judge the quality of growth in results, not just speed.","not all results r excellent you should work more on that displaying quality of growth in results","0b1efdce"),
 U("expectation","Ask what the surprise element in a good result is before expecting a reaction.","what is the surprise element here ?","a522bfff"),
 U("reaction_signal","Negative market context can override a stock's result setup.","market context is very negative","0db3d497"),
 U("expectation","Whether a stock is priced in depends on market context, sector state and the valuation model.","Many things market context and sector state and valuation model","9e593800"),
 U("result_quality","Anyone can pull the numbers; study the quality of earnings behind a result.","u should study quality of earnings","4058de3d"),
 U("expectation","Check how long sector multiples have sustained historically before assuming a re-rating.","when was the last time auto anc traded at 40 P/E and how long it continued","947524e8"),
 U("expectation","Most of the move is priced in at very high valuations.","Agree most is priced in","94beed50",metrics="P/E 157"),
 U("timing","Entering just after results leaves enough time to act; without cash you cannot add.","it did not move for 2 mins gave enough time .. could not add cash","7f509778",stage="result-day"),
 U("entry_exit","Take a few bets when many odds are in favour, post results, with good position sizing.","take some good bets but few when many odds in favour","30f9a237",stage="post-result"),
 U("case","A delayed PEAD move in Vimta Labs sustained well after a similar earlier action.","Yes and it sustained great","f0bb91d1",company="Vimta Labs"),
 U("expectation","Good results may already be priced in, so check before expecting a reaction.","good results .is it not priced in ?","324b6046"),
 U("definition","PEAD is more about a surprise or shock in results.","PEAD is more of suprise r shock","ad9c7272"),
 U("expectation","One good quarter is not enough; a company needs consistent good results before trusting it.","1st time in its life delivered good results for 2 consecutive quarters","8e977085"),
 U("expectation","Management commitment to a strong next quarter may already be priced in.","But priced in for that","a5ba122c"),
 U("expectation","The move may be priced in beyond reasonable comprehension.","it is priced in beyond my comprehension","81caff3f"),
 U("pitfall","Your own entry does not make a stock good; risk appetite differs by investor.","My risk appetite is different","d4412679"),
 U("entry_exit","Trail the position with a stop loss until the company regains lost market share.","until then I trail with stop loss","d4a41e01"),
 U("expectation","Profitability depends on how much sales the company can push and how long the market pays on P/S.","So it depends on how much sales it can push and how long market takes it on P/S","db6fc363"),
 U("checklist_item","Check the maths and exit multiples before accepting a claimed upside.","do u have maths and exit multiples","ba13b7c9"),
 U("expectation","Filter for at least 40-50% upside on paper.","my filter is 40-50% upside atleast on paper","9089713c",metrics="40-50% upside"),
 U("guidance_signal","Anchor PAT and EPS to management guidance when management has a good track record.","I would go with what leadership gudied for 50 eps for fy26","6ff5d175",metrics="EPS 50 FY26"),
 U("guidance_signal","Give the benefit of doubt while topline keeps improving and leadership is clear on guidance.","as long as company improving topline we can give benifit of doubt","874ed10b"),
 U("post_result_trigger","Real triggers such as new capex going live determine when the story turns.","when is that new capex in Guj LIVE","3efe3ca5",trig="capacity"),
 U("guidance_signal","Market can rerate a stock on the concall after management has lost trust.","Market can rerate based on call","db59a5cc"),
 U("result_quality","Rising volume with falling realisations can cap margin expansion unless raw material costs ease or pricing improves.","the volume uptick is positive but falling realisations in key segments could cap margin expansion","952b3568",trig="margin"),
 U("expectation","Once a result is no longer a QoQ play, the story turns to re-rating.","Now it is not QOQ play","6e819f74"),
 U("definition","PEAD is more of a valuation catch-up than a technical setup.","It is more of valuation catch up","382c9ca7"),
 U("expectation","Little surprise remains in the cable segment unless margins improve or capex is added.","I dont see surpise element in cable side","e4906495"),
 U("pitfall","Some traders enter before results and call it PEAD; their odds are lower.","some take it before and call it PEAD. thier odds r less","b2178829"),
 U("expectation","Most of it is priced in; let the results decide.","most of it priced in .. let us see results","f766a8a7"),
 U("definition","PEAD is one of several strategy buckets, alongside momentum and value.","I track 1) hockey stick growth companies at inflection point 2) momentum 3) PEAD","4684ff27"),
 U("definition","Good results alone do not make a PEAD; the result must hold a surprise or shock.","not everything deliverd good results wont be pead","b7f0477b"),
 U("definition","PEAD is about surprise, not guessing or anticipating the result.","Guess vs anticipate","666f3510"),
 U("timing","Good results may take two quarters to become visible even when most of the story is priced in.","good results will be visible after 2 quarters","cc670de7"),
 U("post_result_trigger","Operating leverage is expected to kick in at a specific later quarter; check what drives the price now.","as I understand op leverage kicks in Q4FY26","a881dfc6",trig="margin",metrics="Q4FY26"),
 U("entry_exit","Entering within minutes of results gives a large margin of safety.","I got within 7 mins of results . So huge margin of saftey","548d67b3",stage="result-day"),
 U("result_quality","Separate non-operational items such as deferred tax gains and exceptional gains from a sale when judging a result.","Non operational Deferred tax gains Exceptional gains from Chennai sale","7210d15a"),
 U("entry_exit","Exit when valuation catches up unless growth is structural, in which case hold for the long term.","Exit based on when I feel valuation catches up r if it is structural growth story hold for long term","a10374a0"),
 U("expectation","A stock with a pipeline of big orders may be priced in for its base case.","priced in for base case , unless few big order piped in","5a2f8192",trig="orders"),
 U("reaction_signal","A stock that does not move after good results may already be fully priced in.","May be all priced in","4c01ef45"),
 U("case","A pharma turnaround was acted on quickly from the results and a glance at past results.","I felt as per results and quickly glance at screener of past results I felt it is turning around","e93991f1"),
 U("definition","The real edge is in surprises, positive or negative, across topline, bottom line or margins.","The real game is in surprises","4f7eb9a1"),
 U("timing","Not every good result deserves a re-rating; timing matters.","Not every good result deserves a re-rating","4f7eb9a1"),
 U("guidance_signal","Management commentary often reveals the truth behind the numbers.","Management commentary often reveals the truth behind numbers","4f7eb9a1"),
 U("expectation","After spotting genuinely good results, the next key is identifying the valuation gap.","the next key is identifying the valuation gap","4f7eb9a1"),
 U("result_quality","Most investors glance at the top or bottom line and stop; decode all three statements.","Most just glance at the top line or bottom line and stop there","4f7eb9a1"),
 U("expectation","A result that is in line may already be priced in.","i felt fairly priced in","d0322ca0"),
 U("expectation","Estimate the remaining run-up from context such as last year's median P/E and order book.","looks last year median PE and orderbook further","cd6b6d6b",metrics="20-25% run"),
 U("checklist_item","PEAD setup: low valuations, low expectations, a surprise with results, and a road map for growth.","Low valuations Low expectations Surprise and shock with results Good road map for growth","957038be",company="Krystal"),
]
C["pead-t2-c002"] = [
 U("pitfall","PEAD is being abused when used loosely.","PEAD is being abused","65c0fbca"),
 U("timing","Wait until the next quarter before acting on a result that only just beats guidance.","I would wait till next Quarter","e277d608",stage="q+1"),
 U("timing","Giving a couple of quarters is fine if the margin of safety is adequate; otherwise redeploy.","Nothing wrong in giving couple of quarters time if you have enough margin saftey","3a4c7276"),
 U("checklist_item","Compute book value per share for FY27 from the company's profit to gauge returns.","learn how to calcuate this for FY27 bases on their profit","132fd5f1"),
 U("checklist_item","Read all leaders in each segment, especially after results, concalls and presentations.","u should read all leaders in all segments esp after results esp concalls , ppt","77986256"),
 U("post_result_trigger","Seasonal demand in Q4 and Q1 can make proxy stocks an easy bet.","Q4 , Q1 is peal travel and vacation season","77986256",trig="demand"),
 U("expectation","Companies not dependent on government capex should do well when government bill delays hit.","Companies which r not dependent on govt capex should do well","cbfe1f70",trig="policy"),
 U("result_quality","Bottom line growth did not meet the eye, despite headline growth.","bottom line growth did not meet the eye","05550923"),
 U("expectation","A result in line with guidance may already be priced in for the future.","pricing in for future","d8cbca4d"),
 U("checklist_item","It is too soon to judge a change in character after a PEAD move; listen to the concall.","agree it is too soon . if ur not listen thier Q3 call","4ff9dce4"),
 U("entry_exit","Sell even a highest-conviction holding if better opportunities emerge.","I dont hesitate to sell even my highest conviction idea if any better opportunities","813e3f6c"),
 U("case","AMI results produced back-to-back PEAD.","back to back pead . massive","a46d16aa",company="AMI"),
 U("definition","PEAD comes out of the blue like a surprise or shock.","pead comes out of blue like surprise r shock","9725ca4e"),
 U("pitfall","Changing your view every quarter on core positions prevents multibagger returns.","If I have changed my view for every quarter for core positions I could have never made multi baggers","a20c1a23"),
 U("guidance_signal","For low-risk names that miss a quarter occasionally, look at guidance and vision.","look at thier guidance and vision","f58af44f"),
 U("entry_exit","Exit when utilisation is high and the stock has run, a sign the cycle is peaking.","but when all transformers running with 80% and it was at 40% that was exit for me","c34aef0b"),
 U("entry_exit","PEAD momentum stocks get out once valuations catch up.","Momentum r PEAD stocks get out once valuations catch up","4b854f3b"),
 U("entry_exit","Stocks that display consistency can be held longer.","stocks which displays consistency like kaynes r anantraj will hold longer","4b854f3b"),
 U("definition","PEAD is a subset of episodic pivot.","PEAD is subset of episodic pivot","ea7a085d"),
 U("definition","PEAD is one of the ways he uses during results time.","PEAD is just one of the way I use during results times","af00b52a"),
 U("checklist_item","Track all results.","track all the results","2ce02920"),
 U("timing","The perfect PEAD window was two quarters back; late entries miss it.","missed 2 Q back . that was perfect pead time","038cdcce"),
 U("post_result_trigger","Inorganic acquisitions can surprise beyond the reported numbers.","they can surprise with inorganic acquisition","2c12aef0",trig="corporate-action"),
 U("post_result_trigger","A capex announcement that shocks the market can be the perfect buying spot.","Indotech shocked everyone with capex plans that was the perfect buying spot on that day","b91f0479",trig="capacity"),
 U("case","A PEAD name can graduate into a core holding.","it is PEAD one became core now along with kaynes , syrma","2cbfb013"),
 U("expectation","Consistent companies can be fairly valued at this point.","agree it is is with fair valuation now","c9c58faf"),
 U("expectation","The price already reflects the business, and growth will not repeat the speed of earlier years.","I see it is priced in it , it wont growth with same speed as in last few years","5d5ac6fe"),
 U("entry_exit","Exit when valuation catches up if growth is not structural; otherwise hold until the next quarter results.","when the valuation catchup if the growth is not structual else keep it until next q to see results","2e302075"),
 U("timing","The next leg of momentum starts after Q3/Q4 results.","next leg momentum starts after Q3/Q4 results","02bc6adc"),
 U("entry_exit","Exit once the story is mostly priced in.","Otherwise mostly priced in . Exited","22641717"),
 U("guidance_signal","Leadership walking the talk since IPO builds trust, even with dilution.","leadership walking the talk since IPO r exceeded expectations","dcf74da3"),
 U("expectation","Consistency and certainty are improving, which deserves better valuations.","consistency and certainty is improving . that deserves better valuations","df405992"),
 U("entry_exit","Entered before Q4 results after taking gains on PEAD plays.","For now yes as I got good PEAD plays . Will get into before Q4","a885b795"),
 U("entry_exit","He rarely enters before results and prefers to enter after them.","I rarely Took an entry before results","317dc2ec",stage="pre-result"),
 U("entry_exit","A simple PEAD exit rule is once valuations have caught up.","Simple way is once the valuations catched up","4404f443"),
 U("timing","The market takes about two months to realise a sector story.","Many realise this after 2 months","930eece2"),
 U("definition","PEAD is about surprise or shock, with the upside.","but surprise or shock with upper side","2ec33e5d"),
 U("expectation","Everything is already priced in; momentum is driving the price.","All r priced in already","8cf0b69a"),
 U("expectation","Question whether a stock is already priced in before expecting a reaction.","Is it not priced in yet ?","7cf2aafa"),
 U("guidance_signal","Look for execution before accepting guided growth.","I would like to see execution","1456e098"),
 U("expectation","Most of the story is already priced in.","i guess all r priced in","5f3e83f4"),
 U("guidance_signal","Unless management walks the talk, the story is only a narrative.","Unless they walk the talk , it is more of narrative for me","4b5c1826"),
 U("definition","PEAD stands for post-earnings announcement drift.","Post earnings announcement drift","0674484a"),
 U("timing","Give results 30-45 days to decide once good news is priced in.","either we should give time for 30-45 days to let results decide","44667c6c"),
 U("post_result_trigger","Q2 is the trigger for a story that is fully priced in.","All r priced in . Q2 will be trigger","9f68a55e",trig="other",stage="q+1"),
 U("reaction_signal","With a low float, price action depends on whether specific holders want to hold or dump.","given such a low float the price action depends on specific HNI whether they want to hold r dump","9716b4b6"),
 U("guidance_signal","Management that gives point-to-point updates builds trust.","They always gave point to point to update","7b63df96"),
 U("guidance_signal","Less certainty of growth mentioned in the call signals it is not a one-quarter event.","in call they mention les certainty of growth it is not one q event","7a92d993"),
 U("guidance_signal","Listen to the concall to understand future growth and commentary.","Listend concall understand future growth r commentabry","b4e8b8e7"),
 U("guidance_signal","Guided estimates that the company could not meet are a warning sign.","guided estimates they could not meet","d02b566a"),
 U("post_result_trigger","If a few large orders are executed in the next 12-18 months, the stock becomes attractive.","if they get couple of xxxMW order to be executed in next 12 - 18 months things get attractive","d02b566a",trig="orders",horizon="12-18 months"),
 U("post_result_trigger","The next trigger is new capex starting to generate revenue.","next trigger will be will new capex starts generating revenue","d7049317",trig="capacity"),
]
C["pead-t3-c001"] = [
 R("expectation","Guidance raised to a minimum of 60% growth, with strong growth expected beyond FY27.","FY27 revenue growth guidance raised from 40% to a minimum of 60% YoY","fe3c2700",company="HFCL",metrics="FY27 growth >= 60%"),
 R("case","Promoter stake sale was driven by strong demand from marquee investors.","Promoter stake sale: Driven by strong demand from marquee investors","6da66382",company="Welspun Corp"),
 R("expectation","Brokerage targets have moved rapidly after management visits.","What is even more interesting is how rapidly brokerage targets have moved","71671e34",company="STL Tech"),
 R("expectation","Monthly updates suggest the revenue guidance may be beaten.","Guidance of 6500cr revenue for fy2027 - seems on track to beat it from monthly updates","9b95cfe8"),
 R("case","The real story is a structural margin transformation in one segment, not the headline numbers.","the real story is the structural margin transformation in the Communication Cables segment","6707e5aa",company="Finolex Cables"),
 R("case","The earnings call is a benchmark for disclosure quality.","earnings call as a benchmark for disclosure quality","26c09005",company="Bajaj Auto"),
 R("expectation","Guidance held despite a weak quarter, so the real story is the outlook.","Mgmt maintained its 2,000 Cr FY27 revenue guidance despite a weak Q4","0ed18647",company="SP Apparels"),
 R("expectation","A subdued base year can lead to a sharp profit rebound the following year.","FY28 Net Profit may move ~3x from subdued FY26 PAT","1f22a77b",company="Gokaldas Exports"),
 R("case","A record quarter was reported as the highest ever.","Highest ever quarterly performance","e9ac66d6",company="Jayaswal Neco"),
 R("expectation","A supplier could surprise on the upside as the market tightens.","MTARTECH and $BE can surprise big time","55bdaab8",company="MTAR"),
 R("expectation","Rising input prices can create inventory gains in the next quarter.","This could lead to a meaningful inventory gains for PVC pipes companies in Q4","21c3d46f",company="Apollo Pipes"),
 R("expectation","When an earnings surprise hits, price often drifts in the same direction for weeks.","When earnings surprise hits, price often drifts in the same direction for weeks","8142cb92"),
 R("expectation","Margin expansion for a vendor tied to a dominant OEM is capped by design.","Margin expansion in such cases is capped by design, not by capability.","4a93303d"),
 R("expectation","The company targets a reduction in debt in the current fiscal year.","Target is to reduce debt by $0.8 to $1.0 billion across the group in the current fiscal year","15d05d19",company="Vedanta"),
 R("case","Free cash flow and net cash position are a key point for the company.","Company should do Rs 170 Cr+ free cash flow and is net cash positive by Rs 200 Cr","18b5f17c",company="Vaibhav Global"),
 R("expectation","Positive cash flows are expected by the end of the year.","Expect Positive Cash Flows By End Of FY26","b9690f79",company="Kaynes Technology"),
 R("reaction_signal","A guidance cut by a key customer is a negative read-through.","NEGATIVE READ THROUGH FOR BHARAT FORGE JUST NOW","a912c1cd",company="Bharat Forge"),
 R("expectation","High-quality growth is sustainable if driven by structural demand rather than short-term triggers.","High-quality growth; sustainable if driven by structural demand rather than short-term triggers","9119bc63"),
 R("reaction_signal","The stock reaction may be muted if the market sees through an accounting effect.","Stock reaction may be muted if market sees through the accounting effect","9119bc63"),
 R("reaction_signal","The market does not reward margin expansion without sales growth.","The market does not care about margin expansion when there isn't sales growth.","136f2283",company="Shankara Building Products"),
 R("reaction_signal","A disappointing result can hit a stock after a sharp run-up.","they gave bakwas result at a time when stock is up 100% in last 2-3 months","f2212478"),
 R("case","Weak sales growth is the main concern despite cost discipline and one-off gains.","Sales not much improvement that is main concern for me","b9442f35",company="Samhi Hotels"),
 R("expectation","Not every good result deserves a re-rating; timing matters.","Not every good result deserves a re-rating","08fd59af"),
 R("expectation","Lower rates may produce many earnings surprises from the next quarter.","we could see many earning surprises starting the 2nd quarter of the current financial year","f8dd9270"),
 R("expectation","The sector outlook for the next year is robust.","Outlook for FY26 is robust","21a8e820",company="Jewellery sector"),
 R("expectation","Expected PAT and book value imply a specific P/B at this level.","Expected PAT of 250cr+ in FY27 with an equity base of 1700cr","18580a19"),
]
C["pead-t3-c002"] = [
 R("expectation","Order book to reach a target level by a given quarter.","Current orders: 3.5 million, to reach 7-8 million","3a8887c6",company="Standard Glass Lining"),
 R("expectation","CDMO share of the revenue mix is expected to rise.","CDMO will be 30-40% of mix","7f84f215",company="Senores Pharmaceuticals"),
 R("expectation","Capacity going live next year and margin expansion expected.","Windlas next year capacity going live, margin expansion(injectable)","228ffea3",company="Windlas Biotech"),
 R("expectation","The PAT target could be a multiple of the current level if achieved.","FY26 PAT is expected to be 45 Crores. If mgmt. can achieve that, it could be easily 2-3x from here","a1045022",company="Freshara Agro"),
 R("expectation","Management maintains the revenue guidance for the target year.","Mgmnt maintains guidance for FY25 Target 5200-5500 Cr revenue in FY26","b71983d4",company="Syrma SGS"),
 R("case","A regulator-appointed forensic audit raises governance concerns.","SEBI has intimated the appointment of a forensic auditor","12679888",company="TARC"),
 R("case","A standout earnings call with many leads and clear tone.","The best earnings call I heard in this Q is #tdpower systems","8d0353db",company="TD Power Systems"),
 R("expectation","Growth projection for the next fiscal year from the current base.","Projecting growth of 8-10 times by FY26 from the H1FY25 base","562a8710",company="Oriana Power"),
 R("case","Two results-season plays were named together in the thread.","POCL Q1 , DYCL Q2 pead","6fc92ed8"),
 R("expectation","A solid uptick is expected in the second half, which carries most of the year.","H2 heavy and usually 60-65% comes in H2 So expecting solid uptick in H2FY25","c6e786fb",company="Danish Power"),
 R("expectation","Management may raise guidance once more results are in.","Tempted to give higher guidance, but will share in Q3","680f4aea",company="Zaggle"),
 R("expectation","Significant growth expected as the backlog is executed.","Expected to see significant growth in the coming quarters as the backlog is executed","cb812995",company="Pennar Industries"),
 R("expectation","New capex and new pricing start a new story for the company.","A new story begins as new capex is playing out with New pricing","9980af01",company="Manorama Industries"),
 R("expectation","Revenue and margin guidance for the current fiscal year.","The company aims for revenue growth of 45% to 55% and an EBITDA margin of around 10% this fiscal year","326ff922",company="Zaggle"),
 R("case","A write-off on slow state government dues led to a policy change.","Last year Wabag wrote off 300 crore due to slow/non payment of dues by a state govt","06a6182b",company="Wabag"),
 R("expectation","The stock is already priced in for the current order book growth.","otherwise all priced in for the growth of current order book","4f65918f",company="Waaree Renewable"),
 R("expectation","Market share in a new scheme will be higher due to a technology advantage.","The market share of #shaktipumps in component C will be much higher due to tech advantage","960441e9",company="Shakti Pumps"),
 R("expectation","Company projects revenue and margin for the year.","With the company projection of 2000 revenue & 14% EBITDA margins by end of FY25","f57f0525",company="Transformers and Rectifiers"),
 R("case","Highest ever unexecuted order book at the company.","Highest ever unexecuted OB at ₹ 262 Cr","c7788fef",company="Macpower CNC"),
 R("case","Net sales growth for the quarter reported as a percentage.","Net Sales at Rs 713.4 mn up 31.3% YoY","31283d76",company="Macpower CNC"),
 R("expectation","The business keeps beating estimates and the market must acknowledge it.","the business keeps beating estimates","e1ea6b9a"),
 R("expectation","Scale-up is expected to deliver significant revenue within two years.","Wheelsets scale up = 2-3k crore Revenue in 2 yrs","f342d69a"),
]
C["pead-t3-c003"] = [
 R("expectation","Performance is expected to improve after elections with margin recovery as projects pick up.","Anticipates improved performance post-elections with potential for margin recovery as projects and activities pick up","18c2a61a",company="CG Power"),
 R("case","Results show minimal work in progress and no asset build-up.","In fact WIP is minimal and there NO ASSET build up either","cb8490c5",company="Waaree Technologies"),
 R("reaction_signal","A gap-up in the stock is expected on the first trading day after the news.","Monday GAP UPP confirmed","0b0a8368",company="IREDA"),
 R("expectation","The company can potentially report a high PAT in the target year.","company can potentially report PAT of 350cr+ in FY26","f632acb5",company="Sanghvi Movers"),
 R("case","Growth in the loan book attributed for the results performance.","This outstanding performance is attributed to consistent growth in the Loan Book","9399c39a",company="IREDA"),
 R("expectation","Revenue, EBITDA and PAT are estimated to compound at high rates over three years.","Estimate revenue, EBITDA and PAT to grow at 19.7%, 28% and 53% CAGR resp over FY23-26","de7e6344",company="HPL Electric"),
 R("expectation","The second half is expected to be stronger than the first half.","H2 will be far better than H1","f057402f",company="Jupiter Wagons"),
 R("expectation","Management is confident of achieving the revenue target and maintaining margins.","Confident of achieving 2000cr and maintain current margins","067a558b",company="Elecon Engineering"),
 R("expectation","Management expects strong compounded growth over the next few years.","Expects rev/EBITDA/PAT CAGR of 16%/26%/32% from FY23-25E","0ef78395",company="Kirloskar Brothers"),
 R("case","Record quarterly sales reported by the company.","Company Recorded HIGHEST EVER Qtrly Sales","37efb42b",company="Polycab"),
 R("expectation","If management does not walk the talk, the story becomes a narrative.","If Management doesn't Walk the Talk","124d95d1"),
 R("expectation","One big project problem can set back a low-margin business by years.","can be set back by 2 years if one big project gets into trouble","8b15e101"),
]

bad_total = 0
for cid, units in C.items():
    cpath = os.path.join(BASE, "chunks", cid + ".txt")
    text = open(cpath, encoding="utf-8").read()
    blocks = {}
    parts = text.split("<<D ")
    for part in parts[1:]:
        head, _, body = part.partition(">>")
        did = head.split("|")[0].strip()
        blocks[did] = body
    kept, dropped = [], []
    for u in units:
        did = u["docIds"][0]
        body = blocks.get(did)
        ok = body is not None
        if ok:
            lines = [ln for ln in body.split("\n") if not ln.startswith("Q (@")]
            ok = u["verbatim"] in "\n".join(lines)
        if ok:
            kept.append(u)
        else:
            dropped.append((u["docIds"][0][-8:], u["verbatim"][:60]))
    outp = os.path.join(BASE, "units-raw", cid + ".jsonl")
    with open(outp, "w", encoding="utf-8") as f:
        for u in kept:
            f.write(json.dumps(u, ensure_ascii=False) + "\n")
    # re-validate written file
    n = 0
    with open(outp, encoding="utf-8") as f:
        for line in f:
            json.loads(line); n += 1
    print(cid, "written=", n, "dropped=", len(dropped))
    for d in dropped:
        print("   DROP", d)
    bad_total += len(dropped)
print("total dropped", bad_total)
