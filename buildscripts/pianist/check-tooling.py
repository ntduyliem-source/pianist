"""Reject unclassified or missing Pianist scripts; optionally list a tool group."""
import argparse
import json
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent


def verify(directory=DIRECTORY):
    index = json.loads((directory / 'tooling-index.json').read_text(encoding='utf-8'))
    if index.get('schemaVersion') != 1 or not isinstance(index.get('groups'), dict):
        raise ValueError('Unsupported tooling index')
    declared = set()
    for name, group in index['groups'].items():
        if group.get('status') not in ('active', 'maintained-reference', 'historical') or not group.get('description'):
            raise ValueError('Invalid tool group: ' + name)
        for filename in group['files']:
            if Path(filename).name != filename or filename in declared:
                raise ValueError('Unsafe/duplicate tool: ' + filename)
            declared.add(filename)
    actual = {p.name for p in directory.iterdir() if p.is_file() and p.suffix in ('.py', '.ps1', '.ts', '.cjs', '.js', '.mjs', '.sh')}
    if declared != actual:
        raise ValueError(f'Tool inventory differs: unclassified={sorted(actual-declared)}; missing={sorted(declared-actual)}')
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list', metavar='GROUP', help='Show one group after validating all paths')
    args = parser.parse_args()
    index = verify()
    if args.list:
        if args.list not in index['groups']:
            parser.error('Unknown group; choose ' + ', '.join(index['groups']))
        group = index['groups'][args.list]
        print(group['status'] + ': ' + group['description'])
        print('\n'.join(group['files']))
    else:
        print('Classified %d Pianist scripts; active, reference and historical paths all exist.' %
              sum(len(group['files']) for group in index['groups'].values()))
