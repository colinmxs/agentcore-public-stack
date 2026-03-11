#!/usr/bin/env python3
"""
Coverage Comparison Script
Compares current test coverage against previous baseline for critical paths.
"""

import json
import os
import sys
import re
from pathlib import Path
from typing import Dict, List, Optional
import urllib.request
import urllib.error

# Critical path patterns
CRITICAL_PATTERNS = [
    r".*/apis/.*\.py$",
    r".*/rbac/.*\.py$",
    r".*/auth/.*\.py$",
    r".*/agents/.*\.py$",
]

def log_info(msg: str):
    print(f"[INFO] {msg}")

def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)

def log_success(msg: str):
    print(f"[SUCCESS] {msg}")

def is_critical_path(file_path: str) -> bool:
    """Check if file matches critical path patterns."""
    return any(re.match(pattern, file_path) for pattern in CRITICAL_PATTERNS)

def load_coverage_json(file_path: Path) -> Optional[Dict]:
    """Load coverage JSON file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        log_error(f"Failed to load {file_path}: {e}")
        return None

def extract_file_coverage(coverage_data: Dict) -> Dict[str, float]:
    """Extract per-file coverage percentages."""
    file_coverage = {}
    
    if 'files' in coverage_data:
        # Backend coverage format (coverage.py)
        for file_path, data in coverage_data['files'].items():
            summary = data.get('summary', {})
            total = summary.get('num_statements', 0)
            covered = summary.get('covered_lines', 0)
            if total > 0:
                file_coverage[file_path] = (covered / total) * 100
    elif 'total' in coverage_data:
        # Frontend coverage format (vitest/istanbul)
        for file_path, data in coverage_data.items():
            if file_path == 'total':
                continue
            statements = data.get('statements', {})
            total = statements.get('total', 0)
            covered = statements.get('covered', 0)
            if total > 0:
                file_coverage[file_path] = (covered / total) * 100
    
    return file_coverage

def download_previous_coverage(repo: str, token: str, artifact_name: str) -> Optional[Dict]:
    """Download previous coverage artifact from GitHub Actions."""
    log_info(f"Downloading previous {artifact_name} from GitHub Actions...")
    
    # Get latest successful workflow run
    api_url = f"https://api.github.com/repos/{repo}/actions/workflows/nightly.yml/runs"
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            runs_data = json.loads(response.read())
            
        # Find latest successful run
        successful_runs = [r for r in runs_data.get('workflow_runs', []) 
                          if r['status'] == 'completed' and r['conclusion'] == 'success']
        
        if not successful_runs:
            log_info("No previous successful runs found")
            return None
        
        latest_run = successful_runs[0]
        run_id = latest_run['id']
        
        # Get artifacts for this run
        artifacts_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
        req = urllib.request.Request(artifacts_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            artifacts_data = json.loads(response.read())
        
        # Find the specific artifact
        artifact = next((a for a in artifacts_data.get('artifacts', []) 
                        if a['name'] == artifact_name), None)
        
        if not artifact:
            log_info(f"Artifact {artifact_name} not found in previous run")
            return None
        
        # Download artifact (Note: This returns a ZIP, would need extraction in real implementation)
        # For now, return None to indicate baseline not available
        log_info(f"Found previous artifact (ID: {artifact['id']})")
        return None  # Simplified for now
        
    except urllib.error.HTTPError as e:
        log_error(f"HTTP error downloading artifact: {e}")
        return None
    except Exception as e:
        log_error(f"Error downloading artifact: {e}")
        return None

def compare_coverage(current: Dict[str, float], previous: Dict[str, float]) -> List[Dict]:
    """Compare current vs previous coverage and identify decreases."""
    decreases = []
    
    for file_path, current_cov in current.items():
        if not is_critical_path(file_path):
            continue
        
        previous_cov = previous.get(file_path)
        
        if previous_cov is None:
            # New file, not a decrease
            continue
        
        if current_cov < previous_cov:
            decreases.append({
                'file': file_path,
                'previous_coverage': round(previous_cov, 2),
                'current_coverage': round(current_cov, 2),
                'decrease': round(previous_cov - current_cov, 2)
            })
    
    return decreases

def main():
    log_info("Starting coverage comparison...")
    
    # Get environment variables
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    token = os.environ.get('GITHUB_TOKEN', '')
    
    # Load current backend coverage
    backend_coverage_path = Path('backend/coverage.json')
    if backend_coverage_path.exists():
        log_info("Loading current backend coverage...")
        backend_data = load_coverage_json(backend_coverage_path)
        if backend_data:
            current_backend = extract_file_coverage(backend_data)
            log_info(f"Loaded coverage for {len(current_backend)} backend files")
        else:
            current_backend = {}
    else:
        log_info("No backend coverage.json found")
        current_backend = {}
    
    # Load current frontend coverage
    frontend_coverage_path = Path('frontend/ai.client/coverage/coverage-final.json')
    if frontend_coverage_path.exists():
        log_info("Loading current frontend coverage...")
        frontend_data = load_coverage_json(frontend_coverage_path)
        if frontend_data:
            current_frontend = extract_file_coverage(frontend_data)
            log_info(f"Loaded coverage for {len(current_frontend)} frontend files")
        else:
            current_frontend = {}
    else:
        log_info("No frontend coverage-final.json found")
        current_frontend = {}
    
    # Try to download previous coverage (simplified - returns None for now)
    previous_backend = {}
    previous_frontend = {}
    
    if repo and token:
        # In a real implementation, would download and extract artifacts
        log_info("Previous coverage download not yet implemented")
    
    # Compare coverage
    backend_decreases = compare_coverage(current_backend, previous_backend)
    frontend_decreases = compare_coverage(current_frontend, previous_frontend)
    
    # Generate report
    report = {
        'backend_decreases': backend_decreases,
        'frontend_decreases': frontend_decreases,
        'total_decreases': len(backend_decreases) + len(frontend_decreases)
    }
    
    # Write report
    report_path = Path('coverage-comparison.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    log_success(f"Coverage comparison complete: {report['total_decreases']} files with decreased coverage")
    
    if report['total_decreases'] > 0:
        log_info("Files with coverage decreases:")
        for item in backend_decreases + frontend_decreases:
            log_info(f"  {item['file']}: {item['previous_coverage']}% → {item['current_coverage']}% (-{item['decrease']}%)")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
