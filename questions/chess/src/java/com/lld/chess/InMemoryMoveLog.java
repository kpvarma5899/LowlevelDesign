package com.lld.chess;

import java.util.ArrayList;
import java.util.List;

public final class InMemoryMoveLog implements MoveLog {

    private final List<LogRecord> records = new ArrayList<>();

    @Override
    public void append(LogRecord record) {
        records.add(record);
    }

    public List<LogRecord> records() {
        return List.copyOf(records);
    }
}
