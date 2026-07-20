export function normalizeRepositoryIdentity(value) {
  return value.replace(/\.git$/i, "").toLowerCase();
}

export function parseRepositoryIdentity(value) {
  if (typeof value !== "string") return undefined;
  const repositoryIdentity = value.trim();
  const segments = repositoryIdentity.split("/");
  const [host] = segments;
  if (
    repositoryIdentity === "" ||
    repositoryIdentity !== value ||
    repositoryIdentity !== normalizeRepositoryIdentity(repositoryIdentity) ||
    segments.length < 2 ||
    host === undefined ||
    !isValidRepositoryHost(host) ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || !/^[a-z0-9._-]+$/.test(segment),
    )
  ) {
    return undefined;
  }
  return repositoryIdentity;
}

function isValidRepositoryHost(host) {
  return host
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
