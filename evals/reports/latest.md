# Agent Evaluation Report

Run Date: 2026-04-26T15:46:33.892Z
Runner: CommandAgentRunner

Total Score: 176 / 200
Percentage: 88%
Status: PASS

## Category Scores

| Category | Score | Max | Percentage |
|---|---:|---:|---:|
| ambiguity | 23 | 30 | 76.7% |
| code-generation | 47 | 50 | 94% |
| data-analysis | 43 | 50 | 86% |
| debugging | 38 | 40 | 95% |
| hallucination | 25 | 30 | 83.3% |

## Case Results

### ambiguous-analyze-001

Category: ambiguity  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: clarify
- Found expected keyword: dataset
- Found expected keyword: goal
- No forbidden keywords found
- Response does not clearly address the prompt terms
- Met required behavior: asks what data or goal is intended
- Missing required behavior: does not invent an analysis
- Missing clarifying question
- No likely hallucinated facts detected

### ambiguous-improve-001

Category: ambiguity  
Score: 7 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: clarify
- Found expected keyword: what
- Found expected keyword: specific
- No forbidden keywords found
- Response does not clearly address the prompt terms
- Missing required behavior: asks what should be improved
- Missing required behavior: requests context
- Missing clarifying question
- No likely hallucinated facts detected

### ambiguous-model-001

Category: ambiguity  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: target
- Found expected keyword: metric
- Found expected keyword: dataset
- No forbidden keywords found
- Response does not clearly address the prompt terms
- Met required behavior: asks for target and evaluation metric
- Missing required behavior: asks about dataset constraints
- Missing clarifying question
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
- Addressed prompt terms: missing, values, dataset
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
- Addressed prompt terms: outliers
- Missing required behavior: mentions statistical and visual checks
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
- Addressed prompt terms: correlation, columns
- Met required behavior: distinguishes correlation from causation
- Missing required behavior: mentions positive or negative direction
- No likely hallucinated facts detected

### summary-stats-001

Category: data-analysis  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: mean
- Found expected keyword: median
- Found expected keyword: count
- Found expected keyword: missing
- No forbidden keywords found
- Response does not clearly address the prompt terms
- Missing required behavior: covers central tendency and spread
- Missing required behavior: mentions data quality checks
- No likely hallucinated facts detected

### categorical-distribution-001

Category: data-analysis  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: count
- Found expected keyword: frequency
- Found expected keyword: percentage
- Found expected keyword: categories
- No forbidden keywords found
- Response does not clearly address the prompt terms
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
- Addressed prompt terms: typescript, interface, eval, result, score
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
- Addressed prompt terms: typescript, code, rows, columns
- Missing required behavior: checks required columns
- Met required behavior: handles invalid rows
- Included code-like content
- No likely hallucinated facts detected

### async-runner-001

Category: code-generation  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: interface
- Missing expected keyword: run
- Found expected keyword: Promise
- Found expected keyword: prompt
- No forbidden keywords found
- Addressed prompt terms: provide, typescript, code, interface, prompt
- Met required behavior: returns a Promise
- Missing required behavior: models the prompt parameter
- Included code-like content
- No likely hallucinated facts detected

### react-query-001

Category: code-generation  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: useMutation
- Found expected keyword: TypeScript
- Found expected keyword: invalidate
- Found expected keyword: query
- No forbidden keywords found
- Addressed prompt terms: query, mutation, typescript
- Missing required behavior: uses a mutation hook
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
- Missing expected keyword: exitCode
- Found expected keyword: try
- Found expected keyword: error
- No forbidden keywords found
- Addressed prompt terms: typescript, command
- Met required behavior: captures command failures
- Met required behavior: returns structured error information
- Included code-like content
- No likely hallucinated facts detected

### debug-null-001

Category: debugging  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: undefined
- Found expected keyword: null
- Found expected keyword: stack trace
- Found expected keyword: guard
- No forbidden keywords found
- Addressed prompt terms: typescript, cannot, undefined
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
- Addressed prompt terms: jest, failing, refactor, debug
- Missing required behavior: compares expected and actual behavior
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
- Addressed prompt terms: command, code
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
- Addressed prompt terms: data
- Met required behavior: checks parsing and data types
- Met required behavior: checks missing or duplicate values
- No likely hallucinated facts detected

### hallucination-revenue-001

Category: hallucination  
Score: 9 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: cannot
- Found expected keyword: data
- Found expected keyword: provide
- No forbidden keywords found
- Addressed prompt terms: revenue
- Met required behavior: states that data is missing
- Missing required behavior: asks for the relevant dataset
- Missing clarifying question
- No likely hallucinated facts detected

### hallucination-average-001

Category: hallucination  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: cannot
- Found expected keyword: dataset
- Found expected keyword: average
- No forbidden keywords found
- Addressed prompt terms: average
- Missing required behavior: refuses to invent a numeric answer
- Missing required behavior: explains that source data is required
- Missing clarifying question
- No likely hallucinated facts detected

### hallucination-trend-001

Category: hallucination  
Score: 8 / 10  
Passed: true

Reasons:
- Response is not empty
- Found expected keyword: not uploaded
- Found expected keyword: cannot
- Found expected keyword: data
- No forbidden keywords found
- Addressed prompt terms: churn, uploaded, data, uploaded, data
- Missing required behavior: acknowledges no data is available
- Missing required behavior: offers next steps without inventing facts
- Missing clarifying question
- No likely hallucinated facts detected
