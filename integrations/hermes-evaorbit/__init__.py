"""Keep platform loading lazy, like bundled Hermes platform plugins."""
import importlib.util
from pathlib import Path


def register(ctx):
    spec = importlib.util.spec_from_file_location("evaorbit_adapter", Path(__file__).with_name("adapter.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.register(ctx)
