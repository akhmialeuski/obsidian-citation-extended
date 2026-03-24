import os
import re

tasks_dir = '/mnt/c/Users/AnatolKhmialeuski/Knowledge_Base/Projects/Obsidian Citation Extended/OCE - Tasks'
target_file = '/home/anatolk/.gemini/antigravity/brain/3476a08e-61a3-4c3c-a852-9b21085b1581/todo_tasks.md.resolved'

task_statuses = {}
for file in os.listdir(tasks_dir):
    if not file.endswith('.md'): continue
    path = os.path.join(tasks_dir, file)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            match = re.search(r'^status:\s*(.+)$', content, re.MULTILINE)
            if match:
                title = file.replace('OCE - Task - ', 'Task: ').replace('.md', '')
                task_statuses[title.strip().lower()] = match.group(1).strip()
    except Exception as e:
        print(e)

with open(target_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    match = re.match(r'^(\s*-\s*)\[([ x])\]\s*(Task:.*?)(?:\s*\(Status:.*?\))?$', line)
    if match:
        prefix = match.group(1)
        task_title = match.group(3).strip()
        
        clean_title = task_title.lower()
        clean_title = re.sub(r'[^a-z0-9]', '', clean_title)
        
        status = None
        for k, v in task_statuses.items():
            clean_k = re.sub(r'[^a-z0-9]', '', k)
            if clean_title == clean_k or clean_title in clean_k or clean_k in clean_title:
                status = v
                break
        
        if status:
            if status.lower() not in ['done', 'closed']:
                new_lines.append(f"{prefix}[ ] {task_title}\n")
        else:
            if match.group(2) == ' ':
                new_lines.append(f"{prefix}[ ] {task_title}\n")
    else:
        new_lines.append(line)

with open(target_file, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Cleanup completed successfully.")
