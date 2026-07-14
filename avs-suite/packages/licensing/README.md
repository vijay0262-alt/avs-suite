# @avs/licensing

Interfaces only — no working implementation ships in this scaffold.

`ILicensingService` describes the surface every consumer must depend on.
`NullLicensingService` is the default binding used until real licensing
lands; it reports "Free" edition and rejects activation calls.

Future implementation goals:

* Offline license files signed with Ed25519.
* Online activation against `services/license-server`.
* Grace-period re-validation.
* Seat management for the Enterprise edition.
