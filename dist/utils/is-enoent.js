export function isEnoent(error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
