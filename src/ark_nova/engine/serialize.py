"""Generic JSON (de)serialization for the state dataclasses.

`to_jsonable(obj)` -> plain dict/list/str/int/bool/None; `from_jsonable(cls, data)` rebuilds the dataclass tree using the
type hints (list[...], dict[str, ...], Optional[...], nested dataclasses, Enums). No schema is duplicated.
"""
import dataclasses
import enum
import types
import typing
from typing import Any, get_args, get_origin, get_type_hints


def to_jsonable(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: to_jsonable(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    return obj


def from_jsonable(tp: Any, data: Any) -> Any:
    origin = get_origin(tp)
    if tp is Any or data is None:
        return data
    if origin in (typing.Union, types.UnionType):
        args = [a for a in get_args(tp) if a is not type(None)]
        return from_jsonable(args[0], data) if len(args) == 1 else data
    if origin is list:
        (item,) = get_args(tp)
        return [from_jsonable(item, x) for x in data]
    if origin is dict:
        _, val = get_args(tp)
        return {k: from_jsonable(val, v) for k, v in data.items()}
    if isinstance(tp, type) and issubclass(tp, enum.Enum):
        return tp(data)
    if dataclasses.is_dataclass(tp):
        hints = get_type_hints(tp)
        kwargs = {f.name: from_jsonable(hints[f.name], data[f.name]) for f in dataclasses.fields(tp) if f.name in data}
        return tp(**kwargs)
    return data
