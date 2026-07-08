// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- required by SST for ambient global types ($config, sst, aws, etc.)
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(_input) {
    return {
      name: 'payload-demo',
      removal: 'remove',
      home: 'aws',
      providers: {
        aws: { region: 'ap-southeast-1' },
      },
    }
  },
  async run() {
    const vpc = new sst.aws.Vpc('MyVpc')

    // --- VPC endpoints (no NAT Gateway/instance) ---
    const routeTableIds = $resolve([vpc.nodes.privateRouteTables, vpc.nodes.publicRouteTables]).apply(
      ([privateRouteTables, publicRouteTables]) => [
        ...privateRouteTables.map((rt) => rt.id),
        ...publicRouteTables.map((rt) => rt.id),
      ],
    )

    new aws.ec2.VpcEndpoint('S3Endpoint', {
      vpcId: vpc.id,
      serviceName: 'com.amazonaws.ap-southeast-1.s3',
      vpcEndpointType: 'Gateway',
      routeTableIds,
    })

    // OpenNext's ISR cache uses a DynamoDB table for revalidation tags — Gateway
    // endpoint, free, same pattern as S3.
    new aws.ec2.VpcEndpoint('DynamoDbEndpoint', {
      vpcId: vpc.id,
      serviceName: 'com.amazonaws.ap-southeast-1.dynamodb',
      vpcEndpointType: 'Gateway',
      routeTableIds,
    })

    new aws.ec2.VpcEndpoint('SecretsManagerEndpoint', {
      vpcId: vpc.id,
      serviceName: 'com.amazonaws.ap-southeast-1.secretsmanager',
      vpcEndpointType: 'Interface',
      subnetIds: vpc.privateSubnets,
      securityGroupIds: vpc.securityGroups,
      privateDnsEnabled: true,
    })

    // OpenNext's revalidation events also go through an SQS queue — no Gateway option
    // for SQS, needs an Interface endpoint.
    new aws.ec2.VpcEndpoint('SqsEndpoint', {
      vpcId: vpc.id,
      serviceName: 'com.amazonaws.ap-southeast-1.sqs',
      vpcEndpointType: 'Interface',
      subnetIds: vpc.privateSubnets,
      securityGroupIds: vpc.securityGroups,
      privateDnsEnabled: true,
    })

    // --- Database: Aurora Serverless v2, auto-pauses when idle (cheaper than a
    // fixed RDS instance for a mostly-idle staging environment) ---
    const database = new sst.aws.Aurora('MyDatabase', {
      engine: 'postgres',
      vpc,
      username: 'payload',
      scaling: { min: '0 ACU', max: '2 ACU', pauseAfter: '5 minutes' },
    })

    // sslmode=no-verify: RDS/Aurora enforces encrypted connections (unlike local docker-compose
    // Postgres), but Node's trust store doesn't have AWS's RDS CA — encrypt without verifying the
    // chain. (sslmode=require is NOT equivalent here: pg-connection-string currently treats it as
    // an alias for verify-full, which fails without that CA.)
    const databaseUrl = $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}?sslmode=no-verify`

    // --- App secrets (needed now: PayloadSecret is required for getPayload() to init at all) ---
    const payloadSecret = new sst.Secret('PayloadSecret')
    const previewSecret = new sst.Secret('PreviewSecret')

    // --- Media bucket: private, served through Payload's own /api/media/file proxy
    // route (same pattern as the existing Phase 2 bucket) — no public access needed ---
    const mediaBucket = new sst.aws.Bucket('MediaBucket')

    // --- One-off migration/seed runner, invoked manually after deploy ---
    const migrateFn = new sst.aws.Function('MigrateFunction', {
      handler: 'infra/migrate-handler.handler',
      vpc,
      timeout: '120 seconds',
      // Pinned: Node 24's require(esm) interop chokes on Payload's dynamically-loaded
      // .ts migration files requiring @payloadcms/db-postgres's ESM build. Node 20 (this
      // project's documented minimum, per package.json engines) doesn't hit this.
      runtime: 'nodejs24.x',
      link: [mediaBucket],
      nodejs: { install: ['sharp', 'tsx', '@payloadcms/db-postgres', 'payload', 'pg'] },
      // payload.db.migrate() reads migration files from disk at runtime — esbuild only
      // follows static JS/TS imports, so the migrations directory needs an explicit copy.
      copyFiles: [{ from: 'src/migrations', to: 'migrations' }],
      environment: {
        DATABASE_URL: databaseUrl,
        PAYLOAD_SECRET: payloadSecret.value,
        S3_BUCKET: mediaBucket.name,
        S3_REGION: 'ap-southeast-1',
        // Payload dynamically imports raw .ts migration files at runtime; the bare Lambda
        // Node runtime needs a TS loader to execute them (matches local dev's tsx usage).
        NODE_OPTIONS: '--import tsx/esm',
      },
    })

    // --- The app itself: Lambda via OpenNext + CloudFront ---
    const web = new sst.aws.Nextjs('MyWeb', {
      vpc,
      server: {
        install: ['sharp'],
        // SST's 20s default is too tight for Aurora Serverless v2 resuming from a full
        // pause (scaling.pauseAfter above) on a cold request — give it more headroom.
        // Kept under CloudFront's default 60s response timeout.
        timeout: '55 seconds',
      },
      link: [mediaBucket, payloadSecret, previewSecret],
      environment: {
        DATABASE_URL: databaseUrl,
        PAYLOAD_SECRET: payloadSecret.value,
        PREVIEW_SECRET: previewSecret.value,
        S3_BUCKET: mediaBucket.name,
        S3_REGION: 'ap-southeast-1',
        // Next's `output: standalone` bundles the build machine's .env file into the
        // deployment package. Locally that file sets AWS_PROFILE for SSO credentials, which
        // doesn't exist inside Lambda — dotenv fills in any var absent from process.env, so
        // without this override it clobbers the execution role's real credentials at runtime.
        AWS_PROFILE: '',
      },
    })

    return {
      databaseHost: database.host,
      migrateFunctionName: migrateFn.name,
      previewSecretName: previewSecret.name,
      mediaBucketName: mediaBucket.name,
      url: web.url,
    }
  },
})
