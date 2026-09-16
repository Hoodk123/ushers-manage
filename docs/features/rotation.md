# Rotation

Fair, automatic scheduling so no usher is overused.

## Queue

Each admin has a `RotationQueueEntry` list, one entry per usher, ordered by
`position` (`UNIQUE(adminId, position)`). The usher at the front is the next
to be assigned.

## Shift generation

When an admin requests coverage for a service:

1. Take active ushers from the front of the queue (up to the requested count).
2. Create a `Shift` (`status: ASSIGNED`) per chosen usher.
3. Move each used usher to the back of the queue.
4. Skip inactive ushers and ushers already booked for that service.

A usher appears at most once per service — enforced by
`UNIQUE(usherId, serviceId)` on `Shift`.

## Status

DB + seed ready. Rotation service logic TBD.