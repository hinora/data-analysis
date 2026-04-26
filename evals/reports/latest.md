# Agent Evaluation Report

Run Date: 2026-04-26T16:05:12.474Z
Runner: MockAgentRunner

Total Score: 189 / 200
Percentage: 94.5%
Status: PASS

## Category Scores

| Category | Score | Max | Percentage |
|---|---:|---:|---:|
| ambiguity | 29 | 30 | 96.7% |
| code-generation | 49 | 50 | 98% |
| data-analysis | 46 | 50 | 92% |
| debugging | 37 | 40 | 92.5% |
| hallucination | 28 | 30 | 93.3% |

## Case Results

### ambiguous-analyze-001

Category: ambiguity  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: clarify
- Found expected keyword: dataset
- Found expected keyword: goal
- No forbidden keywords found
- Addressed prompt terms: analyze, this
- Met required behavior: asks what data or goal is intended
- Met required behavior: does not invent an analysis
- Asked a clarifying question
- No likely hallucinated facts detected

### ambiguous-improve-001

Category: ambiguity  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: clarify
- Missing expected keyword: what
- Found expected keyword: specific
- No forbidden keywords found
- Addressed prompt terms: improve
- Missing required behavior: asks what should be improved
- Met required behavior: requests context
- Asked a clarifying question
- No likely hallucinated facts detected

### ambiguous-model-001

Category: ambiguity  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: target
- Found expected keyword: metric
- Found expected keyword: dataset
- No forbidden keywords found
- Addressed prompt terms: build, best, model
- Met required behavior: asks for target and evaluation metric
- Met required behavior: asks about dataset constraints
- Asked a clarifying question
- No likely hallucinated facts detected

### missing-values-001

Category: data-analysis  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: missing values
- Found expected keyword: null
- Found expected keyword: undefined
- Found expected keyword: impute
- No forbidden keywords found
- Addressed prompt terms: handle, missing, values, dataset
- Met required behavior: mentions multiple strategies
- Missing required behavior: explains when to use each strategy
- No likely hallucinated facts detected

### outliers-001

Category: data-analysis  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: outliers
- Found expected keyword: z-score
- Found expected keyword: IQR
- Found expected keyword: visualize
- No forbidden keywords found
- Addressed prompt terms: practical, detect, outliers, before, modeling
- Met required behavior: mentions statistical and visual checks
- Missing required behavior: warns against automatic removal
- No likely hallucinated facts detected

### correlation-001

Category: data-analysis  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: correlation
- Found expected keyword: direction
- Found expected keyword: strength
- Found expected keyword: causation
- No forbidden keywords found
- Addressed prompt terms: should, interpret, correlation, between, numeric
- Met required behavior: distinguishes correlation from causation
- Missing required behavior: mentions positive or negative direction
- No likely hallucinated facts detected

### summary-stats-001

Category: data-analysis  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: mean
- Found expected keyword: median
- Found expected keyword: count
- Found expected keyword: missing
- No forbidden keywords found
- Addressed prompt terms: summary, statistics, should, check, exploring
- Met required behavior: covers central tendency and spread
- Met required behavior: mentions data quality checks
- No likely hallucinated facts detected

### categorical-distribution-001

Category: data-analysis  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: count
- Found expected keyword: frequency
- Found expected keyword: percentage
- Found expected keyword: categories
- No forbidden keywords found
- Addressed prompt terms: understand, distribution, categorical, field
- Missing required behavior: suggests counts or proportions
- Met required behavior: mentions rare categories
- No likely hallucinated facts detected

### typescript-interface-001

Category: code-generation  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: interface
- Found expected keyword: score
- Found expected keyword: maxScore
- Found expected keyword: passed
- Found expected keyword: reasons
- No forbidden keywords found
- Addressed prompt terms: write, typescript, interface, eval, result
- Met required behavior: uses TypeScript types
- Missing required behavior: includes all requested fields
- Included code-like content
- No likely hallucinated facts detected

### csv-parse-001

Category: code-generation  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: TypeScript
- Found expected keyword: CSV
- Found expected keyword: validate
- Found expected keyword: columns
- No forbidden keywords found
- Addressed prompt terms: show, typescript, code, that, parses
- Met required behavior: checks required columns
- Met required behavior: handles invalid rows
- Included code-like content
- No likely hallucinated facts detected

### async-runner-001

Category: code-generation  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: interface
- Found expected keyword: run
- Found expected keyword: Promise
- Found expected keyword: prompt
- No forbidden keywords found
- Addressed prompt terms: provide, typescript, code, async, runner
- Met required behavior: returns a Promise
- Missing required behavior: models the prompt parameter
- Included code-like content
- No likely hallucinated facts detected

### react-query-001

Category: code-generation  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: useMutation
- Found expected keyword: TypeScript
- Found expected keyword: invalidate
- Found expected keyword: query
- No forbidden keywords found
- Addressed prompt terms: would, write, react, query, mutation
- Met required behavior: uses a mutation hook
- Missing required behavior: mentions cache invalidation
- Included code-like content
- No likely hallucinated facts detected

### error-handling-001

Category: code-generation  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: stderr
- Found expected keyword: exitCode
- Missing expected keyword: try
- Found expected keyword: error
- No forbidden keywords found
- Addressed prompt terms: give, typescript, guidance, handling, errors
- Missing required behavior: captures command failures
- Met required behavior: returns structured error information
- Included code-like content
- No likely hallucinated facts detected

### debug-null-001

Category: debugging  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: undefined
- Found expected keyword: null
- Found expected keyword: stack trace
- Missing expected keyword: guard
- No forbidden keywords found
- Addressed prompt terms: typescript, function, crashes, cannot, read
- Missing required behavior: suggests reproducing the issue
- Missing required behavior: suggests input validation or guards
- No likely hallucinated facts detected

### debug-test-failure-001

Category: debugging  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: Jest
- Found expected keyword: refactor
- Found expected keyword: failing
- Found expected keyword: regression
- No forbidden keywords found
- Addressed prompt terms: jest, test, started, failing, after
- Met required behavior: compares expected and actual behavior
- Missing required behavior: recommends a focused regression fix
- No likely hallucinated facts detected

### debug-command-001

Category: debugging  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: exit code
- Found expected keyword: stderr
- Found expected keyword: logs
- Found expected keyword: environment
- No forbidden keywords found
- Addressed prompt terms: local, command, exits, code, stdout
- Met required behavior: checks stderr and logs
- Met required behavior: mentions environment or configuration
- No likely hallucinated facts detected

### debug-data-quality-001

Category: debugging  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: CSV
- Found expected keyword: types
- Found expected keyword: missing
- Found expected keyword: duplicates
- No forbidden keywords found
- Addressed prompt terms: chart, looks, wrong, after, importing
- Met required behavior: checks parsing and data types
- Met required behavior: checks missing or duplicate values
- No likely hallucinated facts detected

### hallucination-revenue-001

Category: hallucination  
Score: 10 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: cannot
- Found expected keyword: data
- Found expected keyword: provide
- No forbidden keywords found
- Addressed prompt terms: which, product, highest, revenue, last
- Met required behavior: states that data is missing
- Met required behavior: asks for the relevant dataset
- Asked a clarifying question
- No likely hallucinated facts detected

### hallucination-average-001

Category: hallucination  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: cannot
- Found expected keyword: dataset
- Found expected keyword: average
- No forbidden keywords found
- Addressed prompt terms: average, customer
- Missing required behavior: refuses to invent a numeric answer
- Missing required behavior: explains that source data is required
- Asked a clarifying question
- No likely hallucinated facts detected

### hallucination-trend-001

Category: hallucination  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: not uploaded
- Found expected keyword: cannot
- Found expected keyword: data
- No forbidden keywords found
- Addressed prompt terms: tell, churn, trend, uploaded, data
- Missing required behavior: acknowledges no data is available
- Missing required behavior: offers next steps without inventing facts
- Asked a clarifying question
- No likely hallucinated facts detected
