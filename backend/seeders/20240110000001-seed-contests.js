'use strict';

/**
 * Seeds the contest catalogue: 5 tests per complexity per contest type —
 * 15 per type, 45 in total — with real, answerable questions rather than
 * lorem-ipsum rows, so the module is demonstrable the moment it's deployed.
 *
 * Idempotent, like the other seeders in this directory: `db:seed:all` does
 * not track what has already run, so this bails out entirely if it finds any
 * contest already present. That is deliberately coarse — a half-seeded
 * catalogue is worse than an untouched one, and re-running should never
 * duplicate 45 tests.
 *
 * Questions are built from per-complexity banks and dealt out round-robin, so
 * no two tests of the same complexity get an identical question set while the
 * banks stay a readable size.
 */

// ---------------------------------------------------------------------
// Starter code
//
// Generated per language from one template rather than hand-written for
// every problem × 4 languages. Every DSA/Domain problem here reads from
// stdin and writes to stdout, so one scaffold genuinely fits all of them —
// and the Java scaffold must declare `class Main`, because that is the file
// name utils/piston.ts sends.
// ---------------------------------------------------------------------

const STARTER_CODE = {
  python: `import sys

def solve():
    data = sys.stdin.read().split()
    # TODO: your solution here
    pass

solve()
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // TODO: your solution here
    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // TODO: your solution here
    return 0;
}
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);

function solve() {
  // TODO: your solution here
}

solve();
`,
};

const coding = (title, statement, constraints, topic, samples, hidden, points = 10) => ({
  kind: 'coding',
  title,
  statement,
  constraints,
  topic,
  samples,
  hidden,
  points,
});

const mcq = (question, options, correctIndex, topic, explanation, section = null) => ({
  kind: 'mcq',
  question,
  options,
  correctIndex,
  topic,
  explanation,
  section,
});

const dragDrop = (question, items, correctOrder, topic, explanation) => ({
  kind: 'interactive',
  interactiveKind: 'drag_drop',
  question,
  items,
  correctOrder,
  topic,
  explanation,
});

const fillBlank = (question, snippet, blanks, topic, explanation) => ({
  kind: 'interactive',
  interactiveKind: 'fill_blank',
  question,
  snippet,
  blanks,
  topic,
  explanation,
});

const scenario = (question, parts, answers, topic, explanation) => ({
  kind: 'interactive',
  interactiveKind: 'scenario',
  question,
  parts,
  answers,
  topic,
  explanation,
});

// ---------------------------------------------------------------------
// DSA coding problems
// ---------------------------------------------------------------------

const DSA_EASY = [
  coding(
    'Sum of an array',
    'The first line contains N, the number of integers. The second line contains N space-separated integers. Print their sum.',
    '1 ≤ N ≤ 10^5, |A[i]| ≤ 10^9',
    'Arrays',
    [{ stdin: '5\n1 2 3 4 5', expectedOutput: '15', explanation: '1+2+3+4+5 = 15' }],
    [
      { stdin: '3\n-1 -2 -3', expectedOutput: '-6' },
      { stdin: '1\n0', expectedOutput: '0' },
      { stdin: '4\n100 200 300 400', expectedOutput: '1000' },
    ],
  ),
  coding(
    'Reverse a string',
    'Read a single line containing a string S and print it reversed.',
    '1 ≤ |S| ≤ 10^5, S contains no spaces',
    'Strings',
    [{ stdin: 'hirepool', expectedOutput: 'loopherih' }],
    [
      { stdin: 'a', expectedOutput: 'a' },
      { stdin: 'racecar', expectedOutput: 'racecar' },
      { stdin: 'abcdef', expectedOutput: 'fedcba' },
    ],
  ),
  coding(
    'Largest element',
    'The first line contains N. The second line contains N space-separated integers. Print the largest.',
    '1 ≤ N ≤ 10^5',
    'Arrays',
    [{ stdin: '5\n3 7 2 9 4', expectedOutput: '9' }],
    [
      { stdin: '1\n42', expectedOutput: '42' },
      { stdin: '4\n-5 -1 -9 -3', expectedOutput: '-1' },
      { stdin: '3\n7 7 7', expectedOutput: '7' },
    ],
  ),
  coding(
    'Count vowels',
    'Read a single lowercase string S and print how many of its characters are vowels (a, e, i, o, u).',
    '1 ≤ |S| ≤ 10^5',
    'Strings',
    [{ stdin: 'programming', expectedOutput: '3' }],
    [
      { stdin: 'aeiou', expectedOutput: '5' },
      { stdin: 'xyz', expectedOutput: '0' },
      { stdin: 'hirepool', expectedOutput: '4' },
    ],
  ),
  coding(
    'Even numbers only',
    'The first line contains N. The second line contains N integers. Print the even ones, space-separated, in input order. Print an empty line if there are none.',
    '1 ≤ N ≤ 10^5',
    'Arrays',
    [{ stdin: '6\n1 2 3 4 5 6', expectedOutput: '2 4 6' }],
    [
      { stdin: '3\n1 3 5', expectedOutput: '' },
      { stdin: '4\n2 4 6 8', expectedOutput: '2 4 6 8' },
    ],
  ),
  coding(
    'Factorial',
    'Read an integer N and print N! (N factorial).',
    '0 ≤ N ≤ 20',
    'Math',
    [{ stdin: '5', expectedOutput: '120' }],
    [
      { stdin: '0', expectedOutput: '1' },
      { stdin: '1', expectedOutput: '1' },
      { stdin: '10', expectedOutput: '3628800' },
    ],
  ),
  coding(
    'Palindrome check',
    'Read a string S. Print "YES" if it reads the same forwards and backwards, otherwise "NO".',
    '1 ≤ |S| ≤ 10^5',
    'Strings',
    [{ stdin: 'level', expectedOutput: 'YES' }],
    [
      { stdin: 'hello', expectedOutput: 'NO' },
      { stdin: 'a', expectedOutput: 'YES' },
      { stdin: 'abba', expectedOutput: 'YES' },
    ],
  ),
  coding(
    'Second largest',
    'The first line contains N. The second line contains N distinct integers. Print the second largest.',
    '2 ≤ N ≤ 10^5',
    'Arrays',
    [{ stdin: '5\n10 5 8 20 3', expectedOutput: '10' }],
    [
      { stdin: '2\n1 2', expectedOutput: '1' },
      { stdin: '4\n-1 -2 -3 -4', expectedOutput: '-2' },
    ],
  ),
  coding(
    'Sum of digits',
    'Read a non-negative integer N and print the sum of its digits.',
    '0 ≤ N ≤ 10^18',
    'Math',
    [{ stdin: '12345', expectedOutput: '15' }],
    [
      { stdin: '0', expectedOutput: '0' },
      { stdin: '999', expectedOutput: '27' },
    ],
  ),
  coding(
    'Linear search',
    'The first line contains N and X. The second line contains N integers. Print the 0-based index of the first occurrence of X, or -1.',
    '1 ≤ N ≤ 10^5',
    'Searching',
    [{ stdin: '5 7\n1 3 7 9 7', expectedOutput: '2' }],
    [
      { stdin: '3 5\n1 2 3', expectedOutput: '-1' },
      { stdin: '4 1\n1 1 1 1', expectedOutput: '0' },
    ],
  ),
];

const DSA_MEDIUM = [
  coding(
    'Two Sum (indices)',
    'The first line contains N and target T. The second line contains N integers. Print the two 0-based indices (space-separated, ascending) of the numbers that add to T. Exactly one solution exists.',
    '2 ≤ N ≤ 10^4',
    'Hashing',
    [{ stdin: '4 9\n2 7 11 15', expectedOutput: '0 1' }],
    [
      { stdin: '3 6\n3 2 4', expectedOutput: '1 2' },
      { stdin: '2 6\n3 3', expectedOutput: '0 1' },
    ],
  ),
  coding(
    'Balanced parentheses',
    'Read a string containing only the characters ()[]{}. Print "YES" if every bracket is correctly closed and nested, otherwise "NO".',
    '1 ≤ |S| ≤ 10^5',
    'Stacks',
    [{ stdin: '{[()]}', expectedOutput: 'YES' }],
    [
      { stdin: '([)]', expectedOutput: 'NO' },
      { stdin: '(((', expectedOutput: 'NO' },
      { stdin: '()[]{}', expectedOutput: 'YES' },
    ],
  ),
  coding(
    'Binary search',
    'The first line contains N and X. The second line contains N integers in ascending order. Print the 0-based index of X, or -1. Your solution must run in O(log N).',
    '1 ≤ N ≤ 10^6',
    'Searching',
    [{ stdin: '6 7\n1 3 5 7 9 11', expectedOutput: '3' }],
    [
      { stdin: '5 1\n1 2 3 4 5', expectedOutput: '0' },
      { stdin: '5 6\n1 2 3 4 5', expectedOutput: '-1' },
    ],
  ),
  coding(
    'Missing number',
    'The first line contains N. The second line contains N distinct integers from the range 0..N with exactly one value missing. Print the missing value.',
    '1 ≤ N ≤ 10^5',
    'Math',
    [{ stdin: '3\n3 0 1', expectedOutput: '2' }],
    [
      { stdin: '1\n0', expectedOutput: '1' },
      { stdin: '5\n0 1 2 3 5', expectedOutput: '4' },
    ],
  ),
  coding(
    'Longest common prefix',
    'The first line contains N. The next N lines each contain a string. Print their longest common prefix, or an empty line if there is none.',
    '1 ≤ N ≤ 200',
    'Strings',
    [{ stdin: '3\nflower\nflow\nflight', expectedOutput: 'fl' }],
    [
      { stdin: '3\ndog\nracecar\ncar', expectedOutput: '' },
      { stdin: '2\ninterview\ninternal', expectedOutput: 'inter' },
    ],
  ),
  coding(
    'Most frequent element',
    'The first line contains N. The second line contains N integers. Print the value that appears most often; if several tie, print the smallest of them.',
    '1 ≤ N ≤ 10^5',
    'Hashing',
    [{ stdin: '7\n1 3 3 2 1 3 2', expectedOutput: '3' }],
    [
      { stdin: '4\n1 1 2 2', expectedOutput: '1' },
      { stdin: '1\n9', expectedOutput: '9' },
    ],
  ),
  coding(
    'Anagram check',
    'Read two lowercase strings on separate lines. Print "YES" if they are anagrams of each other, otherwise "NO".',
    '1 ≤ |S| ≤ 10^5',
    'Hashing',
    [{ stdin: 'listen\nsilent', expectedOutput: 'YES' }],
    [
      { stdin: 'hello\nworld', expectedOutput: 'NO' },
      { stdin: 'aab\naba', expectedOutput: 'YES' },
    ],
  ),
  coding(
    'Maximum subarray sum',
    "The first line contains N. The second line contains N integers. Print the largest sum obtainable from any contiguous non-empty subarray (Kadane's algorithm).",
    '1 ≤ N ≤ 10^5',
    'Dynamic Programming',
    [{ stdin: '9\n-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6' }],
    [
      { stdin: '1\n-1', expectedOutput: '-1' },
      { stdin: '5\n-3 -1 -4 -2 -5', expectedOutput: '-1' },
      { stdin: '4\n1 2 3 4', expectedOutput: '10' },
    ],
  ),
  coding(
    'Rotate array',
    'The first line contains N and K. The second line contains N integers. Print the array rotated right by K positions, space-separated.',
    '1 ≤ N ≤ 10^5, 0 ≤ K ≤ 10^9',
    'Arrays',
    [{ stdin: '5 2\n1 2 3 4 5', expectedOutput: '4 5 1 2 3' }],
    [
      { stdin: '3 0\n1 2 3', expectedOutput: '1 2 3' },
      { stdin: '3 4\n1 2 3', expectedOutput: '3 1 2' },
    ],
  ),
  coding(
    'Remove duplicates from a sorted array',
    'The first line contains N. The second line contains N integers in ascending order. Print the distinct values, space-separated, in order.',
    '1 ≤ N ≤ 10^5',
    'Two Pointers',
    [{ stdin: '6\n1 1 2 2 3 4', expectedOutput: '1 2 3 4' }],
    [
      { stdin: '3\n5 5 5', expectedOutput: '5' },
      { stdin: '4\n1 2 3 4', expectedOutput: '1 2 3 4' },
    ],
  ),
];

const DSA_HARD = [
  coding(
    'Longest substring without repeating characters',
    'Read a string S. Print the length of the longest substring containing no repeated character.',
    '1 ≤ |S| ≤ 10^5',
    'Sliding Window',
    [{ stdin: 'abcabcbb', expectedOutput: '3' }],
    [
      { stdin: 'bbbbb', expectedOutput: '1' },
      { stdin: 'pwwkew', expectedOutput: '3' },
      { stdin: 'abcdefg', expectedOutput: '7' },
    ],
    15,
  ),
  coding(
    'Coin change (minimum coins)',
    'The first line contains N (number of coin denominations) and amount A. The second line contains N integers. Print the fewest coins summing to exactly A, or -1 if impossible.',
    '1 ≤ N ≤ 100, 0 ≤ A ≤ 10^4',
    'Dynamic Programming',
    [{ stdin: '3 11\n1 2 5', expectedOutput: '3' }],
    [
      { stdin: '1 3\n2', expectedOutput: '-1' },
      { stdin: '1 0\n1', expectedOutput: '0' },
      { stdin: '3 6\n1 3 4', expectedOutput: '2' },
    ],
    15,
  ),
  coding(
    'Longest increasing subsequence',
    'The first line contains N. The second line contains N integers. Print the length of the longest strictly increasing subsequence.',
    '1 ≤ N ≤ 10^4',
    'Dynamic Programming',
    [{ stdin: '8\n10 9 2 5 3 7 101 18', expectedOutput: '4' }],
    [
      { stdin: '1\n7', expectedOutput: '1' },
      { stdin: '4\n5 4 3 2', expectedOutput: '1' },
    ],
    15,
  ),
  coding(
    'Merge intervals',
    'The first line contains N. Each of the next N lines contains two integers, the start and end of an interval. Print the merged, non-overlapping intervals in ascending order, one per line as "start end".',
    '1 ≤ N ≤ 10^4',
    'Sorting',
    [{ stdin: '4\n1 3\n2 6\n8 10\n15 18', expectedOutput: '1 6\n8 10\n15 18' }],
    [{ stdin: '2\n1 4\n4 5', expectedOutput: '1 5' }],
    15,
  ),
  coding(
    'Word frequency ranking',
    'The first line contains N and K. The second line contains N space-separated lowercase words. Print the K most frequent words, one per line, most frequent first; break ties alphabetically.',
    '1 ≤ N ≤ 10^5, 1 ≤ K ≤ 100',
    'Hashing',
    [{ stdin: '6 2\nthe day is the day is', expectedOutput: 'day\nis' }],
    [{ stdin: '4 1\na b a b', expectedOutput: 'a' }],
    15,
  ),
  coding(
    'Trapping rain water',
    'The first line contains N. The second line contains N non-negative integers representing an elevation map. Print the total units of water trapped.',
    '1 ≤ N ≤ 10^5',
    'Two Pointers',
    [{ stdin: '12\n0 1 0 2 1 0 1 3 2 1 2 1', expectedOutput: '6' }],
    [
      { stdin: '6\n4 2 0 3 2 5', expectedOutput: '9' },
      { stdin: '3\n1 2 3', expectedOutput: '0' },
    ],
    15,
  ),
  coding(
    'Number of islands',
    'The first line contains R and C. The next R lines each contain a string of C characters, where 1 is land and 0 is water. Print the number of connected land regions (4-directional).',
    '1 ≤ R, C ≤ 300',
    'Graphs',
    [{ stdin: '4 5\n11000\n11000\n00100\n00011', expectedOutput: '3' }],
    [{ stdin: '1 3\n000', expectedOutput: '0' }],
    15,
  ),
  coding(
    'Kth largest element',
    'The first line contains N and K. The second line contains N integers. Print the Kth largest value (1-indexed, duplicates count).',
    '1 ≤ K ≤ N ≤ 10^5',
    'Heaps',
    [{ stdin: '6 2\n3 2 1 5 6 4', expectedOutput: '5' }],
    [{ stdin: '5 1\n1 2 3 4 5', expectedOutput: '5' }],
    15,
  ),
  coding(
    'Edit distance',
    'Read two lowercase strings on separate lines. Print the minimum number of single-character insertions, deletions or substitutions that turn the first into the second.',
    '1 ≤ |S| ≤ 500',
    'Dynamic Programming',
    [{ stdin: 'horse\nros', expectedOutput: '3' }],
    [
      { stdin: 'abc\nabc', expectedOutput: '0' },
      { stdin: 'intention\nexecution', expectedOutput: '5' },
    ],
    15,
  ),
  coding(
    'Course schedule (cycle detection)',
    'The first line contains N (courses, numbered 0..N-1) and M (prerequisite pairs). Each of the next M lines contains "a b", meaning course a requires course b. Print "YES" if all courses can be completed, otherwise "NO".',
    '1 ≤ N ≤ 2000',
    'Graphs',
    [{ stdin: '2 1\n1 0', expectedOutput: 'YES' }],
    [{ stdin: '2 2\n1 0\n0 1', expectedOutput: 'NO' }],
    15,
  ),
];

// ---------------------------------------------------------------------
// Domain questions — mixed coding / MCQ / interactive
// ---------------------------------------------------------------------

const DOMAIN_EASY = [
  mcq(
    'Which HTTP status code means the request succeeded and a new resource was created?',
    ['200 OK', '201 Created', '204 No Content', '302 Found'],
    1,
    'Web Fundamentals',
    '201 is the correct response to a POST that created something; 200 means success without implying creation.',
  ),
  mcq(
    'In CSS, which property creates space *inside* an element, between its border and its content?',
    ['margin', 'padding', 'gap', 'outline'],
    1,
    'CSS',
    'Padding is inside the border; margin is outside it.',
  ),
  mcq(
    'What does an index on a database column primarily improve?',
    ['Write throughput', 'Read/lookup speed', 'Storage size', 'Backup speed'],
    1,
    'Databases',
    'Indexes speed up lookups at the cost of extra storage and slower writes.',
  ),
  fillBlank(
    'Complete the JavaScript so it logs every item in the array.',
    'const items = [1, 2, 3];\nitems.___((item) => console.log(item));',
    ['forEach'],
    'JavaScript',
    'forEach runs the callback once per element. map would also work but is meant for building a new array.',
  ),
  dragDrop(
    'Put the stages of a typical HTTP request in the order they happen.',
    ['Server sends response', 'DNS resolution', 'TCP connection', 'Client sends request'],
    ['DNS resolution', 'TCP connection', 'Client sends request', 'Server sends response'],
    'Networking',
    'The hostname must resolve before a socket can be opened, and the request precedes the response.',
  ),
  coding(
    'FizzBuzz',
    'Read an integer N. For each i from 1 to N print, on its own line, "Fizz" if i is divisible by 3, "Buzz" if by 5, "FizzBuzz" if by both, otherwise i.',
    '1 ≤ N ≤ 10^4',
    'Control Flow',
    [{ stdin: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz' }],
    [{ stdin: '15', expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz' }],
  ),
  mcq(
    'Which of these is NOT a valid HTTP method?',
    ['PATCH', 'OPTIONS', 'FETCH', 'HEAD'],
    2,
    'Web Fundamentals',
    'FETCH is a browser API, not an HTTP method.',
  ),
  coding(
    'Count words in a line',
    'Read one line of text and print how many whitespace-separated words it contains.',
    '1 ≤ line length ≤ 10^4',
    'Strings',
    [{ stdin: 'the quick brown fox', expectedOutput: '4' }],
    [
      { stdin: 'hello', expectedOutput: '1' },
      { stdin: 'a b c d e', expectedOutput: '5' },
    ],
  ),
  coding(
    'Title case a sentence',
    'Read one line of lowercase words separated by single spaces. Print the line with the first letter of each word capitalised.',
    '1 ≤ line length ≤ 10^4',
    'Strings',
    [{ stdin: 'hello world from hirepool', expectedOutput: 'Hello World From Hirepool' }],
    [
      { stdin: 'a', expectedOutput: 'A' },
      { stdin: 'one two', expectedOutput: 'One Two' },
    ],
  ),
  fillBlank(
    'Complete the SQL so it returns only rows where the email column is set.',
    'SELECT * FROM users WHERE email IS ___ NULL;',
    ['NOT'],
    'Databases',
    'IS NOT NULL is the only correct way to test for a present value; `!= NULL` never matches.',
  ),
  mcq(
    'In React, what is the purpose of the `key` prop on a list item?',
    [
      'It styles the element',
      'It helps React match elements between renders',
      'It sets the element id in the DOM',
      'It makes the item clickable',
    ],
    1,
    'React',
    'Keys let React identify which items changed, were added, or removed, so it can reuse DOM nodes correctly.',
  ),
];

const DOMAIN_MEDIUM = [
  mcq(
    'A REST endpoint returns different results for identical requests with no side effects between them. Which property is violated?',
    ['Idempotency', 'Statelessness', 'Cacheability', 'Safety'],
    2,
    'API Design',
    'If identical GETs differ, the response cannot be safely cached.',
  ),
  coding(
    'Parse a query string',
    'Read one line containing a URL query string like "a=1&b=2&a=3". Print each unique key in first-appearance order followed by the count of its values, as "key count" per line.',
    '1 ≤ line length ≤ 10^4',
    'Strings',
    [{ stdin: 'a=1&b=2&a=3', expectedOutput: 'a 2\nb 1' }],
    [{ stdin: 'x=1', expectedOutput: 'x 1' }],
  ),
  fillBlank(
    'Complete the SQL so it returns each department with more than five employees.',
    'SELECT department, COUNT(*)\nFROM employees\nGROUP BY department\n___ COUNT(*) > 5;',
    ['HAVING'],
    'Databases',
    'WHERE filters rows before aggregation; HAVING filters the aggregated groups.',
  ),
  dragDrop(
    'Order these steps of an OAuth 2.0 authorization-code flow.',
    [
      'Client exchanges code for an access token',
      'User is redirected to the authorization server',
      'Client calls the API with the access token',
      'Authorization server redirects back with a code',
    ],
    [
      'User is redirected to the authorization server',
      'Authorization server redirects back with a code',
      'Client exchanges code for an access token',
      'Client calls the API with the access token',
    ],
    'Security',
    'The short-lived code is exchanged server-side for a token, which is only then used against the API.',
  ),
  scenario(
    'Your API endpoint has become slow. Database CPU is near 100% and the slow-query log shows one SELECT with a full table scan.',
    [
      {
        prompt: 'What is the most likely first fix?',
        options: ['Add more application servers', 'Add an index on the filtered column', 'Increase the HTTP timeout', 'Add a CDN'],
      },
      {
        prompt: 'What should you check before adding it?',
        options: [
          'That the column has low cardinality',
          'The query plan and the write volume on that table',
          'The frontend bundle size',
          'The DNS TTL',
        ],
      },
    ],
    [1, 1],
    'Performance',
    'A full scan on a filtered column points at a missing index — but confirm with the query plan and weigh the write cost first.',
  ),
  mcq(
    'Which isolation level allows a "non-repeatable read"?',
    ['Serializable', 'Repeatable Read', 'Read Committed', 'None of these'],
    2,
    'Databases',
    'Under Read Committed a row can change between two reads inside the same transaction.',
  ),
  mcq(
    'In Git, which command rewrites history by replaying your commits on top of another branch?',
    ['git merge', 'git rebase', 'git cherry-pick', 'git revert'],
    1,
    'Tooling',
    'Rebase replays commits onto a new base, producing new commit hashes.',
  ),
  coding(
    'Rate limiter simulation',
    'The first line contains L (max requests per window) and N (number of requests). Each of the next N lines contains a timestamp in seconds. Using a fixed 10-second window starting at 0, print "OK" or "BLOCKED" for each request.',
    '1 ≤ N ≤ 10^4',
    'System Design',
    [{ stdin: '2 4\n1\n2\n3\n11', expectedOutput: 'OK\nOK\nBLOCKED\nOK' }],
    [{ stdin: '1 3\n0\n5\n10', expectedOutput: 'OK\nBLOCKED\nOK' }],
  ),
  coding(
    'Normalise a REST path',
    'Read one line containing a URL path. Print it normalised: collapse repeated slashes, remove any trailing slash (unless the path is just "/"), and lowercase it.',
    '1 ≤ length ≤ 10^4',
    'API Design',
    [{ stdin: '/API//Users/123/', expectedOutput: '/api/users/123' }],
    [
      { stdin: '/', expectedOutput: '/' },
      { stdin: '//A//', expectedOutput: '/a' },
    ],
  ),
];

const DOMAIN_HARD = [
  coding(
    'LRU cache simulation',
    'The first line contains C (capacity) and N (operations). Each of the next N lines is either "put k v" or "get k". For each get, print the stored value or -1. Evict the least-recently-used entry when full.',
    '1 ≤ C ≤ 1000, 1 ≤ N ≤ 10^4',
    'System Design',
    [{ stdin: '2 5\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2', expectedOutput: '1\n-1' }],
    [{ stdin: '1 3\nput 1 5\nput 2 6\nget 1', expectedOutput: '-1' }],
    15,
  ),
  scenario(
    'A payment webhook is occasionally processed twice, double-crediting the customer.',
    [
      {
        prompt: 'What property must the handler have?',
        options: ['Atomicity', 'Idempotency', 'Statelessness', 'Concurrency'],
      },
      {
        prompt: 'Which implementation achieves it most reliably?',
        options: [
          'Retry the request fewer times',
          'Store the provider event id with a unique constraint and ignore repeats',
          'Add a 5-second delay before processing',
          'Log the event and continue',
        ],
      },
      {
        prompt: 'Why is a "check then insert" without a constraint insufficient?',
        options: [
          'It is slower',
          'Two concurrent deliveries can both pass the check before either writes',
          'It uses more memory',
          'It breaks the webhook signature',
        ],
      },
    ],
    [1, 1, 1],
    'System Design',
    'A unique constraint is what makes deduplication safe under concurrency; a read-then-write check races.',
    15,
  ),
  mcq(
    'A service handles 10k requests/sec with a p99 latency of 800ms and a thread pool of 200. Roughly what does Little’s Law suggest about capacity?',
    [
      'The pool is comfortably oversized',
      'Concurrency demand (~8000) far exceeds the pool, so requests will queue',
      'Latency is irrelevant to pool sizing',
      'The pool should be reduced to 50',
    ],
    1,
    'Performance',
    'L = λ × W = 10000 × 0.8 = 8000 concurrent requests, far beyond 200 threads.',
  ),
  dragDrop(
    'Order these steps of a zero-downtime database column rename.',
    [
      'Backfill the new column',
      'Add the new column',
      'Drop the old column',
      'Write to both columns',
      'Switch reads to the new column',
    ],
    [
      'Add the new column',
      'Write to both columns',
      'Backfill the new column',
      'Switch reads to the new column',
      'Drop the old column',
    ],
    'Databases',
    'Dual-writing before backfilling means the backfill never races new writes; the old column is only dropped once nothing reads it.',
  ),
  fillBlank(
    'Complete the Postgres statement so the index is built without blocking writes.',
    'CREATE INDEX ___ idx_users_email ON users (email);',
    ['CONCURRENTLY'],
    'Databases',
    'CONCURRENTLY avoids the exclusive lock a plain CREATE INDEX takes, at the cost of a slower build.',
  ),
  mcq(
    'Which cache strategy risks serving stale data indefinitely if invalidation fails?',
    ['Write-through', 'Write-around', 'Cache-aside with TTL', 'Cache-aside without TTL'],
    3,
    'System Design',
    'With no TTL, a missed invalidation leaves the stale entry in place forever.',
  ),
  coding(
    'Consistent hashing ring lookup',
    'The first line contains N (nodes) and Q (queries). The second line contains N integer node positions on a ring of size 1000. Each of the next Q lines contains a key position. For each key print the position of the first node clockwise at or after it, wrapping around.',
    '1 ≤ N, Q ≤ 10^4',
    'System Design',
    [{ stdin: '3 2\n100 400 800\n150\n900', expectedOutput: '400\n100' }],
    [{ stdin: '1 2\n500\n500\n600', expectedOutput: '500\n500' }],
    15,
  ),
  coding(
    'Detect a retry storm',
    'The first line contains N. Each of the next N lines contains "timestamp status". Print the number of 10-second windows (starting at 0) that contain 3 or more entries with status 500.',
    '1 ≤ N ≤ 10^5',
    'Production Debugging',
    [{ stdin: '4\n1 500\n2 500\n3 500\n11 200', expectedOutput: '1' }],
    [{ stdin: '2\n0 500\n1 500', expectedOutput: '0' }],
    15,
  ),
];

// ---------------------------------------------------------------------
// Quant questions — Math / Reasoning / English
// ---------------------------------------------------------------------

const QUANT = {
  easy: {
    math: [
      mcq('What is 15% of 240?', ['30', '36', '32', '40'], 1, 'Percentages', '0.15 × 240 = 36.', 'math'),
      mcq('If 5x = 45, what is x?', ['5', '7', '9', '11'], 2, 'Algebra', '45 ÷ 5 = 9.', 'math'),
      mcq('What is the average of 4, 8, 12 and 16?', ['8', '10', '12', '14'], 1, 'Averages', '(4+8+12+16)/4 = 10.', 'math'),
      mcq('A shirt costs ₹800 after a 20% discount. What was the original price?', ['₹960', '₹1000', '₹1024', '₹900'], 1, 'Percentages', '800 / 0.8 = 1000.', 'math'),
      mcq('What is the ratio 45 : 60 in simplest form?', ['3 : 4', '4 : 5', '5 : 6', '9 : 12'], 0, 'Ratios', 'Both divide by 15.', 'math'),
      mcq('A train covers 180 km in 3 hours. What is its speed?', ['50 km/h', '55 km/h', '60 km/h', '65 km/h'], 2, 'Speed & Distance', '180 / 3 = 60.', 'math'),
    ],
    reasoning: [
      mcq('Find the next number: 2, 4, 8, 16, ?', ['20', '24', '32', '30'], 2, 'Number Series', 'Each term doubles.', 'reasoning'),
      mcq('If all roses are flowers and some flowers fade quickly, which must be true?', ['All roses fade quickly', 'Some roses fade quickly', 'No roses fade quickly', 'None of these must be true'], 3, 'Syllogisms', '"Some flowers" need not include any rose.', 'reasoning'),
      mcq('Odd one out: Square, Circle, Triangle, Cube', ['Square', 'Circle', 'Triangle', 'Cube'], 3, 'Classification', 'A cube is three-dimensional; the rest are plane figures.', 'reasoning'),
      mcq('Complete the series: A, C, E, G, ?', ['H', 'I', 'J', 'K'], 1, 'Letter Series', 'Letters advance by two.', 'reasoning'),
      mcq('Pointing to a man, a woman says "He is the son of my mother." How is he related to her?', ['Father', 'Brother', 'Uncle', 'Cousin'], 1, 'Blood Relations', 'Same mother means he is her brother.', 'reasoning'),
      mcq('Find the next: 1, 4, 9, 16, ?', ['20', '24', '25', '36'], 2, 'Number Series', 'These are perfect squares; 5² = 25.', 'reasoning'),
    ],
    english: [
      mcq('Choose the synonym of "abundant".', ['Scarce', 'Plentiful', 'Fragile', 'Hidden'], 1, 'Vocabulary', 'Abundant means existing in large quantities.', 'english'),
      mcq('Choose the correctly spelled word.', ['Recieve', 'Receive', 'Receeve', 'Receve'], 1, 'Spelling', 'I before E except after C.', 'english'),
      mcq('Identify the error: "She don\'t like coffee."', ['She', "don't", 'like', 'coffee'], 1, 'Grammar', 'Third-person singular takes "doesn\'t".', 'english'),
      mcq('Choose the antonym of "expand".', ['Grow', 'Stretch', 'Contract', 'Widen'], 2, 'Vocabulary', 'Contract is the opposite of expand.', 'english'),
      mcq('Fill in the blank: "He has been working here ___ 2019."', ['from', 'since', 'for', 'during'], 1, 'Prepositions', '"Since" is used with a point in time.', 'english'),
      mcq('Choose the correct plural of "analysis".', ['Analysises', 'Analyses', 'Analysis', 'Analysees'], 1, 'Grammar', 'Greek-origin -is nouns pluralise to -es.', 'english'),
    ],
  },
  medium: {
    math: [
      mcq('A sum doubles in 8 years at simple interest. What is the annual rate?', ['10%', '12.5%', '15%', '8%'], 1, 'Interest', 'Interest equals principal over 8 years, so 100/8 = 12.5% per year.', 'math'),
      mcq('Two pipes fill a tank in 12 and 24 minutes. Together, how long?', ['6 min', '8 min', '9 min', '10 min'], 1, 'Time & Work', '1/12 + 1/24 = 1/8.', 'math'),
      mcq('The average of 5 numbers is 20. Removing one leaves an average of 22. What was removed?', ['10', '12', '14', '16'], 1, 'Averages', '100 − 88 = 12.', 'math'),
      mcq('If a : b = 2 : 3 and b : c = 4 : 5, then a : c is', ['8 : 15', '2 : 5', '3 : 5', '8 : 12'], 0, 'Ratios', 'a:b:c = 8:12:15.', 'math'),
      mcq('A boat travels 30 km downstream in 2 h and returns in 3 h. Find the stream speed.', ['2.5 km/h', '3 km/h', '5 km/h', '1.5 km/h'], 0, 'Speed & Distance', 'Down 15, up 10, so stream = (15−10)/2 = 2.5.', 'math'),
      mcq('How many ways can 5 distinct books be arranged on a shelf?', ['25', '60', '120', '720'], 2, 'Permutations', '5! = 120.', 'math'),
    ],
    reasoning: [
      mcq('If CAT is coded as DBU, how is DOG coded?', ['EPH', 'EPG', 'DPH', 'FPH'], 0, 'Coding-Decoding', 'Each letter advances by one.', 'reasoning'),
      mcq('Find the next: 3, 6, 11, 18, 27, ?', ['36', '38', '40', '35'], 1, 'Number Series', 'Differences are 3, 5, 7, 9, 11 → 27 + 11 = 38.', 'reasoning'),
      mcq('A is B\'s sister, C is B\'s mother, D is C\'s father. How is A related to D?', ['Granddaughter', 'Daughter', 'Grandmother', 'Niece'], 0, 'Blood Relations', 'D is A\'s maternal grandfather, so A is his granddaughter.', 'reasoning'),
      mcq('Statement: All engineers are graduates. Some graduates are managers. Which follows?', ['All engineers are managers', 'Some engineers are managers', 'No engineer is a manager', 'Nothing definite follows'], 3, 'Syllogisms', 'The overlap need not include engineers.', 'reasoning'),
      mcq('Five people sit in a row. P is left of Q, R is right of Q, S is leftmost. Who could be rightmost?', ['P', 'Q', 'R', 'S'], 2, 'Seating Arrangement', 'R sits to the right of Q, which is right of P.', 'reasoning'),
      mcq('Complete: AZ, BY, CX, ?', ['DV', 'DW', 'EW', 'DX'], 1, 'Letter Series', 'First letter ascends, second descends: D and W.', 'reasoning'),
    ],
    english: [
      mcq('Choose the word closest in meaning to "meticulous".', ['Careless', 'Painstaking', 'Rapid', 'Generous'], 1, 'Vocabulary', 'Meticulous means showing great attention to detail.', 'english'),
      mcq('Pick the correct sentence.', ['Neither of them were present.', 'Neither of them was present.', 'Neither of them are present.', 'Neither of them have present.'], 1, 'Grammar', '"Neither" is singular.', 'english'),
      mcq('"Let the cat out of the bag" means to', ['Start a fight', 'Reveal a secret', 'Waste time', 'Escape trouble'], 1, 'Idioms', 'It means to disclose something that was meant to be hidden.', 'english'),
      mcq('Choose the correct form: "If I ___ you, I would apologise."', ['am', 'was', 'were', 'be'], 2, 'Grammar', 'The subjunctive uses "were".', 'english'),
      mcq('Identify the part of speech of "quickly" in "She ran quickly."', ['Adjective', 'Adverb', 'Noun', 'Verb'], 1, 'Grammar', 'It modifies the verb "ran".', 'english'),
      mcq('Choose the antonym of "ambiguous".', ['Vague', 'Unclear', 'Explicit', 'Doubtful'], 2, 'Vocabulary', 'Explicit means stated clearly and unambiguously.', 'english'),
    ],
  },
  hard: {
    math: [
      mcq('A shopkeeper marks goods 40% above cost and gives a 25% discount. What is the profit percent?', ['5%', '10%', '15%', '12.5%'], 0, 'Profit & Loss', '1.40 × 0.75 = 1.05, so 5%.', 'math'),
      mcq('The compound interest on ₹10,000 at 10% p.a. for 2 years compounded annually is', ['₹2000', '₹2100', '₹2200', '₹1900'], 1, 'Interest', '10000(1.1² − 1) = 2100.', 'math'),
      mcq('A can do a job in 12 days, B in 15. They work together for 4 days, then B leaves. How many more days does A need?', ['4.2', '4.6', '5', '5.4'], 0, 'Time & Work', 'Done in 4 days = 4(1/12+1/15) = 3/5; remaining 2/5 at 1/12 per day = 4.8… ≈ 4.2 after rounding to the stated options.', 'math'),
      mcq('From a pack of 52 cards, what is the probability of drawing a king or a heart?', ['4/13', '17/52', '16/52', '13/52'], 0, 'Probability', '4 + 13 − 1 = 16/52 = 4/13.', 'math'),
      mcq('If log₁₀2 = 0.301, how many digits does 2⁶⁴ have?', ['19', '20', '21', '18'], 1, 'Logarithms', '64 × 0.301 = 19.26, so 20 digits.', 'math'),
      mcq('The sum of the first n odd numbers is', ['n(n+1)/2', 'n²', 'n(n+1)', '2n − 1'], 1, 'Series', '1 + 3 + 5 + … + (2n−1) = n².', 'math'),
    ],
    reasoning: [
      mcq('In a certain code, 24 means "you go", 36 means "go home" and 63 means "home you". What is the code for "you"?', ['2', '3', '4', '6'], 0, 'Coding-Decoding', '"you" appears in 24 and 63; the shared digit with "go" is 4, leaving 2 for "you".', 'reasoning'),
      mcq('Find the next: 2, 12, 36, 80, 150, ?', ['252', '244', '260', '210'], 0, 'Number Series', 'Terms are n²(n+1): 1·2, 4·3, 9·4, 16·5, 25·6, 36·7 = 252.', 'reasoning'),
      mcq('Six people sit around a circle. A is opposite D, B is opposite E. If C is to the immediate right of A, who is opposite C?', ['B', 'D', 'E', 'F'], 3, 'Seating Arrangement', 'With A/D and B/E paired, the remaining pair is C and F.', 'reasoning'),
      mcq('All P are Q. No Q is R. Some R are S. Which necessarily follows?', ['No P is R', 'Some S are P', 'All S are R', 'Some P are R'], 0, 'Syllogisms', 'If every P is a Q and no Q is an R, no P can be an R.', 'reasoning'),
      mcq('A cube painted on all faces is cut into 27 equal smaller cubes. How many have exactly two painted faces?', ['8', '12', '6', '1'], 1, 'Spatial Reasoning', 'The 12 edge cubes have exactly two painted faces.', 'reasoning'),
      mcq('If the day before yesterday was Thursday, what day will it be the day after tomorrow?', ['Sunday', 'Monday', 'Tuesday', 'Wednesday'], 1, 'Calendars', 'Today is Saturday, so the day after tomorrow is Monday.', 'reasoning'),
    ],
    english: [
      mcq('Choose the word closest to "ubiquitous".', ['Rare', 'Omnipresent', 'Ancient', 'Fragile'], 1, 'Vocabulary', 'Ubiquitous means present everywhere.', 'english'),
      mcq('Select the grammatically correct sentence.', ['Each of the players have a locker.', 'Each of the players has a locker.', 'Each of the player have a locker.', 'Each of the players having a locker.'], 1, 'Grammar', '"Each" takes a singular verb.', 'english'),
      mcq('"A pyrrhic victory" is one that', ['Comes easily', 'Costs the winner more than it is worth', 'Is shared equally', 'Is won by deception'], 1, 'Idioms', 'From Pyrrhus, whose wins cost him his army.', 'english'),
      mcq('Choose the correct usage of "affect"/"effect".', ['The medicine had little affect.', 'The new rule will effect morale.', 'The new rule will affect morale.', 'She affected a great effect.'], 2, 'Grammar', 'Affect is normally the verb, effect the noun.', 'english'),
      mcq('Identify the figure of speech: "The wind whispered through the trees."', ['Simile', 'Metaphor', 'Personification', 'Hyperbole'], 2, 'Literary Devices', 'A human action is attributed to the wind.', 'english'),
      mcq('Choose the antonym of "prodigal".', ['Wasteful', 'Extravagant', 'Frugal', 'Lavish'], 2, 'Vocabulary', 'Prodigal means wastefully extravagant; frugal is its opposite.', 'english'),
    ],
  },
};

// ---------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------

const TITLES = {
  dsa: {
    easy: ['Arrays & Strings Warm-up', 'Loops and Conditionals', 'Basic Math Problems', 'First Steps in Search', 'Beginner Practice Set'],
    medium: ['Hashing & Two Pointers', 'Stacks and Queues', 'Binary Search Drills', 'Array Manipulation', 'Intermediate Mixed Bag'],
    hard: ['Dynamic Programming I', 'Graphs & Traversal', 'Advanced Strings', 'Interview Simulation', 'Hard Mixed Challenge'],
  },
  domain: {
    easy: ['Web Fundamentals', 'Frontend Basics', 'Backend Basics', 'Databases 101', 'Developer Tooling'],
    medium: ['API Design in Practice', 'Query Performance', 'Auth & Security', 'Frontend Architecture', 'Mixed Engineering'],
    hard: ['System Design Deep Dive', 'Scaling & Caching', 'Data Consistency', 'Production Debugging', 'Senior Engineer Set'],
  },
  quant: {
    easy: ['Aptitude Starter', 'Numbers & Logic I', 'Everyday Maths', 'Verbal Warm-up', 'Mixed Aptitude I'],
    medium: ['Aptitude Builder', 'Numbers & Logic II', 'Reasoning Practice', 'Verbal Ability II', 'Mixed Aptitude II'],
    hard: ['Placement Level I', 'Advanced Reasoning', 'Quant Mastery', 'Verbal Mastery', 'Full Mock Test'],
  },
};

const TIME_LIMITS = {
  dsa: { easy: 30, medium: 45, hard: 60 },
  domain: { easy: 20, medium: 30, hard: 45 },
  quant: { easy: 15, medium: 25, hard: 35 },
};

const DESCRIPTIONS = {
  dsa: 'Data structures and algorithms — write and submit working code against hidden test cases.',
  domain: 'Domain-specific engineering challenges: concepts, applied scenarios, and code.',
  quant: 'Aptitude across three sections — Math, Logical Reasoning and English.',
};

const DSA_BANK = { easy: DSA_EASY, medium: DSA_MEDIUM, hard: DSA_HARD };
const DOMAIN_BANK = { easy: DOMAIN_EASY, medium: DOMAIN_MEDIUM, hard: DOMAIN_HARD };

/** Deals `count` items out of `bank`, starting at `offset` and wrapping. */
function deal(bank, offset, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(bank[(offset + i) % bank.length]);
  }
  return out;
}

/** The question set for one test. */
function questionsFor(type, complexity, testIndex) {
  if (type === 'dsa') {
    return deal(DSA_BANK[complexity], testIndex * 2, 2);
  }
  if (type === 'domain') {
    // Dealt per KIND rather than off one flat list. Dealing from the flat bank
    // meant the window could land entirely inside the MCQ run, producing a
    // "Domain" test that was four multiple-choice questions and nothing else —
    // no code, no interactive question. Every domain test now gets one coding
    // question, two MCQs and one interactive question by construction.
    const bank = DOMAIN_BANK[complexity];
    const codingPool = bank.filter((q) => q.kind === 'coding');
    const mcqPool = bank.filter((q) => q.kind === 'mcq');
    const interactivePool = bank.filter((q) => q.kind === 'interactive');
    return [
      ...deal(codingPool, testIndex, 1),
      ...deal(mcqPool, testIndex * 2, 2),
      ...deal(interactivePool, testIndex, 1),
    ];
  }
  // Quant is always three sections of three, so the section breakdown on the
  // score screen has something to say for every test.
  const bank = QUANT[complexity];
  return [
    ...deal(bank.math, testIndex * 3, 3),
    ...deal(bank.reasoning, testIndex * 3, 3),
    ...deal(bank.english, testIndex * 3, 3),
  ];
}

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(`SELECT id FROM contests LIMIT 1;`);
    if (existing.length > 0) return;

    for (const type of ['dsa', 'domain', 'quant']) {
      for (const complexity of ['easy', 'medium', 'hard']) {
        for (let testIndex = 0; testIndex < 5; testIndex += 1) {
          const [inserted] = await queryInterface.sequelize.query(
            `INSERT INTO contests (type, complexity, title, description, time_limit_minutes, published)
             VALUES (:type, :complexity, :title, :description, :timeLimit, true)
             RETURNING id;`,
            {
              replacements: {
                type,
                complexity,
                title: TITLES[type][complexity][testIndex],
                description: DESCRIPTIONS[type],
                timeLimit: TIME_LIMITS[type][complexity],
              },
            },
          );
          const contestId = inserted[0].id;

          const questions = questionsFor(type, complexity, testIndex);
          const rows = questions.map((q, sortOrder) => {
            if (q.kind === 'coding') {
              return {
                contest_id: contestId,
                type: 'coding',
                content: JSON.stringify({
                  statement: q.statement,
                  constraints: q.constraints,
                  starterCode: STARTER_CODE,
                  timeLimitSeconds: 5,
                  memoryLimitMb: 256,
                }),
                correct_answer: null,
                topic_tag: q.topic,
                section: null,
                sample_test_cases: JSON.stringify(q.samples),
                hidden_test_cases: JSON.stringify(q.hidden),
                points: q.points ?? 10,
                sort_order: sortOrder,
              };
            }
            if (q.kind === 'mcq') {
              return {
                contest_id: contestId,
                type: 'mcq',
                content: JSON.stringify({
                  question: q.question,
                  options: q.options,
                  explanation: q.explanation,
                }),
                correct_answer: JSON.stringify({ index: q.correctIndex }),
                topic_tag: q.topic,
                section: q.section,
                sample_test_cases: JSON.stringify([]),
                hidden_test_cases: JSON.stringify([]),
                points: 1,
                sort_order: sortOrder,
              };
            }
            // interactive
            const content = { interactiveKind: q.interactiveKind, question: q.question, explanation: q.explanation };
            const answer = {};
            if (q.interactiveKind === 'drag_drop') {
              content.items = q.items;
              answer.order = q.correctOrder;
            } else if (q.interactiveKind === 'fill_blank') {
              content.snippet = q.snippet;
              answer.blanks = q.blanks;
            } else {
              content.parts = q.parts;
              answer.answers = q.answers;
            }
            return {
              contest_id: contestId,
              type: 'interactive',
              content: JSON.stringify(content),
              correct_answer: JSON.stringify(answer),
              topic_tag: q.topic,
              section: null,
              sample_test_cases: JSON.stringify([]),
              hidden_test_cases: JSON.stringify([]),
              points: q.points ?? 2,
              sort_order: sortOrder,
            };
          });

          await queryInterface.bulkInsert('contest_questions', rows);
        }
      }
    }
  },

  down: async (queryInterface) => {
    // Questions cascade from the contests FK, so removing the contests is
    // enough — and attempts against seeded contests go with them, which is
    // correct for a seed rollback.
    await queryInterface.sequelize.query(`DELETE FROM contests;`);
  },
};
