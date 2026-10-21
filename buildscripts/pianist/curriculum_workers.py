"""Bounded, recyclable processes for the unchanged music21 normalizer.

At most one in-flight score/result per worker. A timeout/crash replaces only that
process. Musical parsing is still curriculum_normalize.normalize, unchanged.
"""
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import gc
import hashlib
import multiprocessing as mp
from pathlib import Path
import time
import zlib

from curriculum_io import CorpusError, within


def parse_job(job, max_notes):
    from curriculum_normalize import normalize, encoded
    try:
        path=within(Path(job['corpus']),job['path']) if 'corpus' in job else Path(job['absolute'])
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != job['sha']:
            raise CorpusError('source-checksum-mismatch')
        result = normalize(data, max_notes=max_notes)
        raw = encoded(result).encode()
        return {'status': 'normalized', 'blob': zlib.compress(raw),
                'analysis_sha': hashlib.sha256(raw).hexdigest(),
                'blockers': result['releaseBlockers'], 'error': None}
    except Exception as error:
        return {'status': 'rejected', 'blob': None, 'analysis_sha': None,
                'blockers': [str(error) if isinstance(error, CorpusError) else
                             'source-io-error' if isinstance(error,OSError) else 'music21-parse-error'],
                'error': f'{type(error).__name__}: {error}'[:1500]}


def serve(connection, max_notes, recycle):
    try:
        for _ in range(recycle):
            job = connection.recv()
            if job is None:
                break
            result = parse_job(job, max_notes)
            connection.send(result)
            del result
            gc.collect()
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()


class Worker:
    def __init__(self, timeout, max_notes, recycle):
        self.timeout, self.max_notes, self.recycle = timeout, max_notes, recycle
        self.process = self.connection = None
        self.used = 0

    def close(self):
        if self.connection:
            self.connection.close()
        if self.process:
            self.process.join(.2)
            if self.process.is_alive():
                self.process.terminate()
                self.process.join()
            self.process.close()
        self.process = self.connection = None
        self.used = 0

    def run(self, job):
        started = time.monotonic()
        if self.process is None or self.used >= self.recycle or not self.process.is_alive():
            self.close()
            ctx = mp.get_context('spawn')
            self.connection, child = ctx.Pipe()
            self.process = ctx.Process(target=serve, args=(child, self.max_notes, self.recycle))
            self.process.start()
            child.close()
        try:
            self.connection.send(job)
            if not self.connection.poll(self.timeout):
                result = {'status': 'rejected', 'blob': None, 'analysis_sha': None,
                          'blockers': ['normalizer-timeout'], 'error': f'exceeded {self.timeout} seconds'}
                self.close()
            else:
                result = self.connection.recv()
                self.used += 1
        except (EOFError, BrokenPipeError, OSError):
            result = {'status': 'rejected', 'blob': None, 'analysis_sha': None,
                      'blockers': ['normalizer-crashed'], 'error': 'Worker closed without a result'}
            self.close()
        return job, result, time.monotonic() - started


def results(jobs, workers, timeout, max_notes, recycle=32):
    workers = [Worker(timeout, max_notes, recycle) for _ in range(workers)]
    queue = iter(jobs)
    pool = ThreadPoolExecutor(max_workers=len(workers))
    pending = {}
    try:
        for worker in workers:
            job = next(queue, None)
            if job is not None:
                pending[pool.submit(worker.run, job)] = worker
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                worker = pending.pop(future)
                yield future.result()
                job = next(queue, None)
                if job is not None:
                    pending[pool.submit(worker.run, job)] = worker
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
        for worker in workers:
            worker.close()
