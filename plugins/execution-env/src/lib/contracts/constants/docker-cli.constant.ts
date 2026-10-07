/** The host binary every Docker adapter drives. */
export const DOCKER_BINARY = 'docker';

/** Containers run as an ordinary user unless the caller says otherwise. */
export const DOCKER_DEFAULT_USER = '1000:1000';

/** Containers start with no network unless the caller opts in. */
export const DOCKER_DEFAULT_NETWORK = 'none';

/** Keeps a prepared container alive so later commands can exec into it. */
export const DOCKER_IDLE_COMMAND: readonly string[] = ['sleep', 'infinity'];

/** Prefix of the names this plugin gives the containers it creates. */
export const DOCKER_CONTAINER_NAME_PREFIX = 'delendai-env';

/** Length of the random suffix that keeps two runs from sharing a name. */
export const DOCKER_CONTAINER_NAME_SUFFIX_LENGTH = 12;

/** A mount of this host path hands the container control of the host. */
export const DOCKER_SOCKET_HOST_PATH = '/var/run/docker.sock';

/** The `Config.Env` array of an inspected container, as JSON. */
export const DOCKER_INSPECT_ENV_FORMAT = '{{json .Config.Env}}';
