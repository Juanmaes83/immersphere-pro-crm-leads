const GITHUB_API = "https://api.github.com";

export function allowedRepos() {
  return String(process.env.GITHUB_ALLOWED_REPOS || "Juanmaes83/Rubik-Sota-Director-de-Orquesta,Juanmaes83/AURUM_PROPERTIES_BOUTIQUE")
    .split(",")
    .map((repo) => repo.trim())
    .filter(Boolean);
}

export function checkRepoAllowed(repo) {
  return allowedRepos().includes(repo);
}

function token() {
  return String(process.env.GITHUB_SERVER_TOKEN || "").trim();
}

async function githubFetch(path, options = {}) {
  const githubToken = token();
  if (!githubToken) throw new Error("missing_server_side_github_token");
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const error = new Error(body.message || `github_${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

function repoPath(repo) {
  if (!checkRepoAllowed(repo)) throw new Error("repo_not_allowed");
  return `/repos/${repo}`;
}

export async function getDefaultBranch(repo) {
  const body = await githubFetch(repoPath(repo));
  return body.default_branch || "main";
}

export async function getBranchHeadSha(repo, branch) {
  const body = await githubFetch(`${repoPath(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);
  return body.object?.sha;
}

export async function createBranch(repo, newBranch, fromSha) {
  if (!newBranch.startsWith("production/")) throw new Error("branch_must_start_with_production");
  return githubFetch(`${repoPath(repo)}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
}

export async function branchExists(repo, branch) {
  try {
    await githubFetch(`${repoPath(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

export async function getFileInfo(repo, filePath, branch) {
  try {
    const res = await githubFetch(
      `${repoPath(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    );
    return { sha: res.sha || null, exists: true };
  } catch (error) {
    if (error.status === 404) return { sha: null, exists: false };
    throw error;
  }
}

export async function getFileContent(repo, filePath, branch) {
  try {
    const res = await githubFetch(
      `${repoPath(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    );
    const content = res.content
      ? Buffer.from(res.content.replace(/\n/g, ""), "base64").toString("utf8")
      : "";
    return { sha: res.sha || null, exists: true, content };
  } catch (error) {
    if (error.status === 404) return { sha: null, exists: false, content: "" };
    throw error;
  }
}

export async function findOpenPullRequestByHead(repo, headBranch) {
  const owner = repo.split("/")[0];
  const items = await githubFetch(
    `${repoPath(repo)}/pulls?state=open&head=${encodeURIComponent(owner)}:${encodeURIComponent(headBranch)}&per_page=1`,
  );
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}

export async function putFile(repo, branch, path, content, message, sha = undefined) {
  const bodyData = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) bodyData.sha = sha;
  return githubFetch(`${repoPath(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    body: JSON.stringify(bodyData),
  });
}

export async function createPullRequest(repo, headBranch, baseBranch, title, body) {
  if (baseBranch !== "main") throw new Error("base_branch_must_be_main");
  if (!headBranch.startsWith("production/")) throw new Error("branch_must_start_with_production");
  return githubFetch(`${repoPath(repo)}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head: headBranch, base: baseBranch, maintainer_can_modify: true }),
  });
}

export async function getRepoTree(repo: string, branch: string) {
  return githubFetch(`${repoPath(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
}

export function sanitizeGithubError(error) {
  return {
    message: String(error?.message || "github_error").replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g, "[redacted]"),
    status: error?.status || null,
  };
}
