# Apple Root CA certificates

`services/apple/appStoreServer.ts` loads every `*.cer` / `*.pem` file in this
directory as the trust anchors for verifying Apple's JWS signatures (IAP
transactions and App Store Server Notifications V2).

Download the Apple Root certificates from
<https://www.apple.com/certificateauthority/> and drop the `.cer` files here.
At minimum you need:

- **Apple Root CA - G3** (`AppleRootCA-G3.cer`) — the anchor for the modern
  StoreKit / App Store Server API signing chain.

You can safely add the other Apple roots too (they're public). If this folder
has no certificate files, the Apple payment endpoints fail with
`apple_root_certs_missing` (the rest of the backend still boots).

These are public certificates — committing them is fine; they're kept out of
the build only because tsc doesn't copy non-`.ts` files.
