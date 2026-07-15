---
description: 'Reference document — read on demand, not an agent. The runtime-detection + local-landscape + cloud-portability knowledge behind container-ops: which CLI/compose flavor is present, rootless gotchas, multi-arch, and what an image must satisfy to run on GCP and AWS.'
disable: true
mode: "all"
---

# Container Runtimes & Cloud Portability

The knowledge that stops container-ops from looping (assume `docker` → fail →
retry) and lets a local image run unchanged in the cloud. Verified 2025-2026;
⚠-flagged items are version-fluid — re-verify against the linked docs.

Driver rule: **detect once, bind `$CTR` (the CLI) and `$COMPOSE` (the compose
flavor), use them everywhere.** See container-ops.md § "Step 0" and § "Diagnose
before you retry".

---

## 1. The local landscape (what CLI, what engine, daemon or not)

| Tool | CLI | Backend engine | Daemon | Rootless |
|---|---|---|---|---|
| **Docker Desktop** | `docker` | dockerd(moby)→containerd→runc, in a Linux VM | daemon (`docker.sock`) | rootful default |
| **Docker Engine** (Linux) | `docker` | dockerd→containerd→runc | daemon (`docker.service`) | rootful default; rootless opt-in |
| **Podman / Podman Desktop** | `podman` | conmon→crun/runc, **no daemon** | **daemonless** (optional `podman.socket` for Docker-API compat) | **rootless default** |
| **Rancher Desktop** | `nerdctl` **or** `docker` | ⚠ user picks **containerd+nerdctl** OR **dockerd(moby)** in Preferences; also bundles k3s | containerd or dockerd | depends on engine |
| **nerdctl** | `nerdctl` | containerd directly (BuildKit for builds) | containerd daemon | rootless supported |
| **Finch** (AWS) | `finch` | Lima VM → nerdctl+containerd+BuildKit | Lima VM | rootless in VM |
| **colima** | `docker` or `nerdctl` | Lima VM → dockerd **or** containerd | Lima VM | VM-scoped |

Facts that bite:
- **Rancher Desktop's engine is a toggle** (Preferences → Container Engine: `moby` vs `containerd`). ⚠ Images built under one engine are **invisible** to the other.
- `dockerd` is itself a containerd client; `nerdctl` talks to the same containerd minus the daemon.
- `podman` needs a VM on macOS/Windows (`podman machine`); Finch/colima/Rancher all sit on **Lima**.
- ⚠ **`docker` may actually be Podman** — the `podman-docker` package symlinks `/usr/bin/docker → podman`. Verify before assuming daemon semantics.

### Detection sequence (script-safe)
```bash
for c in docker podman nerdctl finch colima; do
  command -v "$c" >/dev/null 2>&1 && echo "found: $c -> $(command -v "$c")"
done
readlink -f "$(command -v docker)"                 # is 'docker' a podman shim?
docker version --format '{{.Server.Engine}}' 2>/dev/null   # 'podman' if aliased
docker info >/dev/null 2>&1 && echo "docker engine UP" || echo "DOWN"
podman machine list 2>/dev/null                    # mac/win: needs a running machine
colima status 2>/dev/null                          # non-zero if not started
rdctl list-settings 2>/dev/null | grep -i containerEngine   # Rancher: moby | containerd
```
Decision: prefer `docker` if `docker info` succeeds; else `podman` (start the
machine first on mac/win); else `nerdctl`/`finch`.

### Start the engine (the "daemon down" fix)
```bash
podman machine init && podman machine start        # macOS/Windows only
colima start                                       # docker runtime
colima start --runtime containerd --arch aarch64 --vm-type vz --cpu 4 --memory 8
finch vm init && finch vm start
sudo systemctl start docker                        # Linux docker engine
systemctl --user start podman.socket               # rootless Docker-API socket
# Docker/Podman/Rancher Desktop: launch the GUI app
```

---

## 2. CLI equivalence (docker / podman / nerdctl)

Podman and nerdctl are deliberate `docker` CLI clones — most verbs are identical
(`ps -a`, `images`, `run -d -p 8080:80`, `logs -f`, `exec -it … sh`, `inspect`,
`network ls`, `push`, `system prune -a`). Differences to call out:

- **Registry resolution.** `docker pull nginx` → `docker.io/library/nginx`
  automatically. ⚠ `podman pull nginx` errors/prompts unless `registries.conf`
  lists search registries — **always fully-qualify** (`docker.io/library/nginx:1.27`).
- **Build backend.** docker routes through buildx/BuildKit; `nerdctl build` needs
  `buildkitd` running; podman uses its own buildah engine.
- **Podman-only:** `podman generate systemd` (deprecated → **Quadlet** `.container`
  files, Podman 4.4+), `podman pod`, `podman play kube` / `podman kube`.
- **nerdctl namespaces:** `nerdctl --namespace k8s.io ps` to see k3s/Rancher workloads.
- `inspect` JSON shapes differ slightly (podman adds fields) — don't hardcode paths across runtimes.

---

## 3. Compose flavors

| Invocation | Implementation | Status |
|---|---|---|
| `docker compose` | Go plugin (Compose v2) | current standard |
| `docker-compose` | Python standalone (v1) | ⚠ **EOL**, removed from Docker Desktop |
| `podman compose …` | ⚠ **wrapper** that delegates to an external provider | Podman 4.1+/5 |
| `podman-compose` | external Python project | separate install, partial spec |
| `nerdctl compose up` | native (BuildKit/containerd) | good compat |

⚠ **Critical nuance: `podman compose` does NOT implement Compose.** It shells out
to a provider — and **`docker-compose` takes precedence over `podman-compose`** if
both are installed. So `podman compose up` may actually be running docker-compose
against the podman socket. Pin it:
```bash
export PODMAN_COMPOSE_PROVIDER="$(command -v podman-compose)"
# or ~/.config/containers/containers.conf:  [engine]\n compose_providers=["/usr/bin/podman-compose"]
```

All honor `docker-compose.yml` / `compose.yaml` for basic services. Divergence:
- `depends_on:` long-form `condition: service_healthy` — solid in Compose v2; ⚠ older `podman-compose` ignores conditions (order-only).
- `healthcheck:` timing semantics differ under podman-compose.
- `profiles:`, `extends:`, `!reset` merge tags — often absent in podman-compose.
- Custom `networks:` options (aliases, ipam) diverge; service-name DNS works everywhere.

Portability: target the **Compose Specification** (no `version:` key), test under
`docker compose` as the reference.

---

## 4. Rootless gotchas (Podman default; Rancher rootless) — the top loop causes

1. **Ports < 1024** can't bind rootless:
   ```bash
   podman run -p 8080:80 img                                   # use a high host port
   sudo sysctl net.ipv4.ip_unprivileged_port_start=80          # or lower the threshold (host-wide)
   ```
2. **Volume ownership / UID-GID mapping.** Rootless maps container UID 0 → your host
   UID, others → high subuid range → bind mounts show as `nobody` or odd UIDs:
   ```bash
   podman run --userns=keep-id -v "$PWD/data:/data" img        # preserve host UID inside
   podman run --userns=keep-id:uid=1000,gid=1000 img
   podman run -v vol:/data:U img                                # :U chowns the volume to the mapped user (careful on big trees)
   ```
   `--userns=keep-id` breaks containers that need real root inside.
3. **SELinux labels** (RHEL/Fedora): bind mounts denied until relabeled — `:z`
   (shared) / `:Z` (private). ⚠ Never `:Z` a system dir (`/home`, `/usr`) — relabel breaks the host.
4. **Networking** ⚠: Podman 5.0+ default rootless backend is **pasta** (was
   slirp4netns); network backend is **netavark** (CNI removed in 5.0).
   `host.containers.internal` reaches the host under netavark/pasta.
   ```bash
   podman info --format '{{.Host.NetworkBackend}}'             # netavark
   ```
5. **`--privileged` rootless** still can't exceed your own capabilities — no real host root, no kernel modules, no raw devices.
6. **Docker-API socket** for tools expecting `DOCKER_HOST`:
   ```bash
   systemctl --user enable --now podman.socket
   export DOCKER_HOST="unix://$XDG_RUNTIME_DIR/podman/podman.sock"
   ```

---

## 5. Multi-arch / the arch-mismatch trap

Build on Apple Silicon (arm64), run on cloud amd64 → `exec format error` or
`no matching manifest for linux/amd64`. The classic silent loop.

### Detect arch
```bash
docker image inspect myimg:tag --format '{{.Architecture}}/{{.Os}}'
docker buildx imagetools inspect nginx:1.27           # remote platform list
docker manifest inspect docker.io/library/nginx:1.27 | grep -A2 platform
```
### Build for a target platform
```bash
docker buildx build --platform linux/amd64 -t myimg:amd64 --load .        # single foreign arch
docker buildx build --platform linux/amd64,linux/arm64 -t REG/img:tag --push .  # multi-arch → registry
podman build --platform linux/amd64,linux/arm64 --manifest myimg:tag .
podman manifest push --all myimg:tag docker://REG/img:tag
```
### buildx caveats ⚠
- The default **`docker` driver can't build multi-platform or `--load` a multi-arch
  image.** Fix: enable Docker Desktop's **containerd image store** (Settings →
  General), OR use a container driver + `--push`:
  ```bash
  docker buildx create --name multi --driver docker-container --use --bootstrap
  docker buildx build --platform linux/amd64,linux/arm64 -t REG/img:tag --push .
  ```
- Cross-arch emulation needs **QEMU/binfmt**: `docker run --privileged --rm
  tonistiigi/binfmt --install all` (Docker Desktop ships these; plain Linux/CI must
  install `qemu-user-static`). Emulated builds are slow — prefer native per-arch
  runners (GitHub `ubuntu-24.04-arm`, AWS Graviton) and merge manifests.

---

## 6. GCP targets

### Artifact Registry (GCR is dead ⚠)
Container Registry (`gcr.io`) is decommissioned: ⚠ shut down for writes
**2025-03-18**, phased pull failures thereafter, `gcr.io` served from Artifact
Registry by **2025-10-14**. Use Artifact Registry.
```bash
# URL: REGION-docker.pkg.dev/PROJECT_ID/REPO/IMAGE:TAG
gcloud artifacts repositories create my-repo --repository-format=docker --location=us-central1
gcloud auth configure-docker us-central1-docker.pkg.dev
docker tag api:latest us-central1-docker.pkg.dev/PROJECT_ID/my-repo/api:1.4.2
docker push us-central1-docker.pkg.dev/PROJECT_ID/my-repo/api:1.4.2
```
### Cloud Run — the image contract (verified)
- **Listen on `0.0.0.0`** (NOT `127.0.0.1`) on **`$PORT` (default 8080)**.
- **Stateless** — instances die anytime; state → Cloud SQL / Memorystore / GCS. `/tmp` is in-memory (counts against RAM).
- **No TLS in the container** — Cloud Run terminates it, proxies plain HTTP.
- **Handle SIGTERM** — 10-second grace, then SIGKILL.
- **linux/amd64**; no privileged ops; CPU throttled outside requests unless CPU-always-on.
```bash
gcloud run deploy api --image us-central1-docker.pkg.dev/PROJECT_ID/my-repo/api:1.4.2 \
  --region us-central1 --port 8080 --allow-unauthenticated
```
### GKE
Standard k8s; image just needs to match node arch (⚠ arm64 Tau T2A / Axion pools
exist — use a multi-arch manifest or `nodeSelector: kubernetes.io/arch`). Pull auth
via Workload Identity or the node SA (AR reader).

---

## 7. AWS targets

### ECR
```bash
# URL: ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/REPO:TAG
aws ecr create-repository --repository-name api --region us-east-1
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker tag api:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/api:1.4.2
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/api:1.4.2
# public: aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
```
### ECS / Fargate — task-def essentials
- Valid Fargate `cpu`/`memory` combo (256/512, 512/1024, 1024/2048…; 1024 = 1 vCPU).
- `portMappings.containerPort`; `networkMode: awsvpc` (required); `requiresCompatibilities: ["FARGATE"]`; `executionRoleArn` to pull ECR + write logs.
- **No `privileged: true` on Fargate** (EC2 launch type only).
- `awslogs` log driver → CloudWatch (`awslogs-group`/`-region`/`-stream-prefix`).
- ⚠ **arm64 / Graviton:** `runtimePlatform: { cpuArchitecture: "ARM64", operatingSystemFamily: "LINUX" }`, Fargate platform ≥ **1.4.0**; all images arm64-compatible; ~20-40% better price-performance.
### App Runner
Source = a ready image in ECR (private/public), no build stage. `ImageConfiguration.Port`
(App Runner injects `PORT`; app listens `0.0.0.0`); autoscaling via `MaxConcurrency`/`MinSize`/`MaxSize`;
TLS terminated by App Runner; stateless like Cloud Run.
### EKS
Managed k8s; image in ECR matching node arch (Graviton nodegroups → arm64/multi-arch); pull auth via node IAM role or IRSA.
### Lambda container images
- ⚠ **≤ 10 GB uncompressed**; **must include a Runtime Interface Client (RIC)** — AWS base
  images (`public.ecr.aws/lambda/python:3.13` etc.) ship the RIC+RIE; custom bases must add `aws-lambda-ric` as ENTRYPOINT.
- linux/amd64 or arm64 matching the function; `/tmp` 512 MB–10 GB; 15-min max.
```dockerfile
FROM public.ecr.aws/lambda/python:3.13
COPY app.py ${LAMBDA_TASK_ROOT}
CMD ["app.handler"]
```

---

## 8. 12-factor portability (makes local→cloud a no-op)

1. **Config via env**, not baked — same image every env; secrets from a manager.
2. **Listen `0.0.0.0` on a configurable `PORT`** (`process.env.PORT || 8080`) — never `127.0.0.1`.
3. **Log to stdout/stderr** — no log files.
4. **Stateless** — no local-disk persistence between requests/instances.
5. **One foreground process as PID 1** — no init/systemd assumptions; use `tini`/`dumb-init` (or `--init` / Compose `init: true`) for signal-forwarding + zombie reaping.
6. **Handle SIGTERM** — drain within the grace window (Cloud Run 10s, ECS `stopTimeout` 30s, k8s 30s).
7. **Non-root** — `USER 1000`; required/expected by most platforms + rootless.
8. **Pin tags/digests** (`image@sha256:…`); avoid `latest`.
9. **`EXPOSE` the port** (documentation/tooling hint).
10. **Match target arch** (§5).

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
USER 1000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]   # binds 0.0.0.0:$PORT, logs stdout, traps SIGTERM
```

---

## 9. Local compose → cloud migration

**Portable:** the Dockerfile / OCI image — build once, push to AR/ECR, run anywhere.
**Does NOT translate** (compose is a local orchestrator, not a deploy target):
- service-name DNS / compose networks (`http://db:5432`) → managed endpoints
- named volumes / bind mounts → managed storage (GCS/S3, Cloud SQL/RDS, EFS, Filestore, PVCs)
- `depends_on` startup ordering → each service deploys independently and retry-connects
- `ports:` host publishing → platform ingress / load balancer

**→ Cloud Run:** one service per image; `db:`→Cloud SQL, `redis:`→Memorystore;
`environment:`→`--set-env-vars`/Secret Manager; inter-service calls → each service's
HTTPS URL (IAM auth); drop `ports/volumes/networks/depends_on`.
**→ ECS/Fargate:** each service → a container def; tightly-coupled ones share one
task def (reach each other on `localhost`) or split behind Service Connect/Cloud Map;
volumes→EFS/managed; env→task def `environment`/`secrets`; `awslogs` driver. Generate
task defs via Copilot/CDK/Terraform.
**→ Kubernetes (GKE/EKS):** each service → Deployment+Service; volumes→PVC; network→cluster
DNS (`svc.ns.svc.cluster.local`); `kompose convert` bootstraps manifests (hand-tune).

Rule of thumb: **compose stays for local dev; the image is the shippable artifact;
every compose *dependency* (db, cache, queue, volume, network) becomes a managed
cloud service or a per-service deployment.**

---

## Re-verify before relying (⚠)
GCR shutdown dates · Podman rootless net default = pasta (5.0+) · `podman compose`
= wrapper (docker-compose wins precedence) · buildx default driver can't `--load`
multi-arch · Fargate arm64 needs platform ≥1.4.0 · Lambda 10 GB + RIC · Compose v1 EOL.

Sources: GCR→AR transition (cloud.google.com/artifact-registry), Cloud Run container
contract, podman-compose docs, Podman pasta networking, Docker multi-platform builds,
ECS arm64 task defs, Lambda container images/quotas, App Runner source image, Rancher
Desktop container engine, Podman rootless volumes.
