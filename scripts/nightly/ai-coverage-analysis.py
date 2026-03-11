#!/usr/bin/env python3
"""
AI Coverage Analysis Script
Uses GitHub Models API to analyze coverage gaps and create/update GitHub issues.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional
import urllib.request
import urllib.error

GITHUB_MODELS_API = "https://models.inference.ai.azure.com/chat/completions"
MODEL = "gpt-4o"

def log_info(msg: str):
    print(f"[INFO] {msg}")

def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)

def log_success(msg: str):
    print(f"[SUCCESS] {msg}")

def call_github_models(prompt: str, token: str) -> Optional[str]:
    """Call GitHub Models API with GPT-4o."""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    
    data = {
        'model': MODEL,
        'messages': [
            {
                'role': 'system',
                'content': 'You are a test coverage analyst. Analyze code coverage gaps and suggest specific test scenarios that should be added.'
            },
            {
                'role': 'user',
                'content': prompt
            }
        ],
        'temperature': 0.7,
        'max_tokens': 1000
    }
    
    try:
        req = urllib.request.Request(
            GITHUB_MODELS_API,
            data=json.dumps(data).encode('utf-8'),
            headers=headers
        )
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result['choices'][0]['message']['content']
    except Exception as e:
        log_error(f"GitHub Models API call failed: {e}")
        return None

def search_existing_issues(repo: str, token: str, file_path: str) -> Optional[int]:
    """Search for existing issue about this file's coverage."""
    query = f"repo:{repo} is:issue is:open label:test-coverage,nightly-build in:title {Path(file_path).name}"
    api_url = f"https://api.github.com/search/issues?q={urllib.parse.quote(query)}"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            items = data.get('items', [])
            if items:
                return items[0]['number']
    except Exception as e:
        log_error(f"Error searching issues: {e}")
    
    return None

def create_issue(repo: str, token: str, title: str, body: str) -> Optional[int]:
    """Create a new GitHub issue."""
    api_url = f"https://api.github.com/repos/{repo}/issues"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }
    
    data = {
        'title': title,
        'body': body,
        'labels': ['test-coverage', 'nightly-build']
    }
    
    try:
        req = urllib.request.Request(
            api_url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result['number']
    except Exception as e:
        log_error(f"Error creating issue: {e}")
        return None

def update_issue(repo: str, token: str, issue_number: int, body: str) -> bool:
    """Update an existing GitHub issue."""
    api_url = f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }
    
    data = {
        'body': body
    }
    
    try:
        req = urllib.request.Request(
            api_url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            return True
    except Exception as e:
        log_error(f"Error updating issue: {e}")
        return False

def analyze_coverage_gap(file_info: Dict, github_token: str) -> Optional[Dict]:
    """Use AI to analyze coverage gap and generate issue content."""
    file_path = file_info['file']
    previous_cov = file_info['previous_coverage']
    current_cov = file_info['current_coverage']
    decrease = file_info['decrease']
    
    prompt = f"""
Analyze this test coverage decrease:

File: {file_path}
Previous Coverage: {previous_cov}%
Current Coverage: {current_cov}%
Decrease: {decrease}%

This file is in a critical path (APIs, RBAC, auth, or agents).

Provide:
1. A brief analysis of why this coverage gap matters
2. 2-3 specific test scenarios that should be added to improve coverage
3. Priority level (High/Medium/Low)

Keep the response concise and actionable.
"""
    
    analysis = call_github_models(prompt, github_token)
    if not analysis:
        return None
    
    return {
        'file': file_path,
        'title': f"Test Coverage Decreased: {Path(file_path).name}",
        'body': f"""## Coverage Decrease Detected

**File:** `{file_path}`
**Previous Coverage:** {previous_cov}%
**Current Coverage:** {current_cov}%
**Decrease:** {decrease}%

## AI Analysis

{analysis}

---
*This issue was automatically generated by the nightly build workflow.*
*Labels: `test-coverage`, `nightly-build`*
"""
    }

def main():
    log_info("Starting AI coverage analysis...")
    
    # Get environment variables
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    github_token = os.environ.get('GITHUB_TOKEN', '')
    
    if not repo or not github_token:
        log_error("GITHUB_REPOSITORY and GITHUB_TOKEN environment variables are required")
        return 1
    
    # Load coverage comparison report
    report_path = Path('coverage-comparison.json')
    if not report_path.exists():
        log_error("coverage-comparison.json not found")
        return 1
    
    with open(report_path, 'r') as f:
        report = json.load(f)
    
    total_decreases = report.get('total_decreases', 0)
    if total_decreases == 0:
        log_success("No coverage decreases detected. No issues to create.")
        return 0
    
    log_info(f"Analyzing {total_decreases} files with coverage decreases...")
    
    all_decreases = report.get('backend_decreases', []) + report.get('frontend_decreases', [])
    
    issues_created = 0
    issues_updated = 0
    
    for file_info in all_decreases:
        file_path = file_info['file']
        log_info(f"Analyzing {file_path}...")
        
        # Generate AI analysis
        issue_data = analyze_coverage_gap(file_info, github_token)
        if not issue_data:
            log_error(f"Failed to generate analysis for {file_path}")
            continue
        
        # Check for existing issue
        existing_issue = search_existing_issues(repo, github_token, file_path)
        
        if existing_issue:
            log_info(f"Found existing issue #{existing_issue}, updating...")
            update_body = f"""## Updated Coverage Analysis

{issue_data['body']}
"""
            if update_issue(repo, github_token, existing_issue, update_body):
                log_success(f"Updated issue #{existing_issue}")
                issues_updated += 1
        else:
            log_info("Creating new issue...")
            issue_number = create_issue(repo, github_token, issue_data['title'], issue_data['body'])
            if issue_number:
                log_success(f"Created issue #{issue_number}")
                issues_created += 1
    
    log_success(f"AI coverage analysis complete: {issues_created} issues created, {issues_updated} issues updated")
    return 0

if __name__ == '__main__':
    sys.exit(main())
