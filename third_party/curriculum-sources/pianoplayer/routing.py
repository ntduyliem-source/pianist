"""Verbatim upstream routing function; imports isolated for offline use."""
from typing import Any
from types import SimpleNamespace
import logging
logger = logging.getLogger(__name__)

def _resolve_musicxml_routing(args: SimpleNamespace, score_info: Any) -> None:
    """Compute and store resolved part/staff routing for RH/LH."""
    parts = getattr(score_info, "parts", None) or []
    auto_routing = bool(getattr(args, "auto_routing", True))
    single_part_staffs: list[int] = []
    if auto_routing:
        if len(parts) == 1:
            if args.rpart != 0:
                logger.debug(
                    "Single-part score detected: remapping right-hand part %s -> 0",
                    args.rpart,
                )
                args.rpart = 0
            if args.lpart != 0:
                logger.debug(
                    "Single-part score detected: remapping left-hand part %s -> 0",
                    args.lpart,
                )
                args.lpart = 0

            staff_values: set[int] = set()
            for evt in parts[0].events:
                for note_el in evt.notes:
                    for child in note_el:
                        tag = child.tag
                        local = tag.rsplit("}", 1)[-1] if tag.startswith("{") else tag
                        if local == "staff":
                            raw_staff = (child.text or "").strip()
                            if raw_staff.isdigit():
                                staff_values.add(int(raw_staff))
                            break
            if staff_values:
                single_part_staffs = sorted(staff_values)

            if not args.left_only and not args.right_only and len(single_part_staffs) <= 1:
                # Annotating both hands would process and overwrite the same stream.
                args.right_only = True
                logger.info("Single-staff score detected; auto-routing to right hand only.")

        if len(parts) > 1:
            args.rpart = max(0, min(int(args.rpart), len(parts) - 1))
            args.lpart = max(0, min(int(args.lpart), len(parts) - 1))

        explicit_rstaff = int(args.rstaff)
        explicit_lstaff = int(args.lstaff)

        if explicit_rstaff > 0:
            args._resolved_rstaff = explicit_rstaff
        elif single_part_staffs:
            if 1 in single_part_staffs:
                args._resolved_rstaff = 1
            else:
                args._resolved_rstaff = single_part_staffs[0]
        else:
            args._resolved_rstaff = None

        if explicit_lstaff > 0:
            args._resolved_lstaff = explicit_lstaff
        elif single_part_staffs:
            if 2 in single_part_staffs:
                args._resolved_lstaff = 2
            elif len(single_part_staffs) > 1:
                args._resolved_lstaff = single_part_staffs[-1]
            else:
                args._resolved_lstaff = single_part_staffs[0]
        else:
            args._resolved_lstaff = None
    else:
        if parts:
            args.rpart = max(0, min(int(args.rpart), len(parts) - 1))
            args.lpart = max(0, min(int(args.lpart), len(parts) - 1))
        args._resolved_rstaff = int(args.rstaff) if int(args.rstaff) > 0 else None
        args._resolved_lstaff = int(args.lstaff) if int(args.lstaff) > 0 else None

    logger.debug(
        "Resolved routing (%s): RH part %s%s | LH part %s%s",
        "auto" if auto_routing else "manual",
        args.rpart,
        f" staff {args._resolved_rstaff}" if args._resolved_rstaff else "",
        args.lpart,
        f" staff {args._resolved_lstaff}" if args._resolved_lstaff else "",
    )
