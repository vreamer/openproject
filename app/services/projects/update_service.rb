#-- encoding: UTF-8

#-- copyright
# OpenProject is a project management system.
# Copyright (C) 2012-2019 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See doc/COPYRIGHT.rdoc for more details.
#++

module Projects
  class UpdateService < ::BaseServices::Update
    private

    attr_accessor :memoized_changes

    def set_attributes(params)
      ret = super

      # Because awesome_nested_set reloads the model after saving, we cannot rely
      # on saved_changes.
      self.memoized_changes = model.changes

      ret
    end

    def after_save(*)
      touch_on_custom_values_update
      notify_on_identifier_renamed
      send_update_notification
      update_wp_versions_on_parent_change
    end

    def touch_on_custom_values_update
      model.touch if only_custom_values_updated?
    end

    def notify_on_identifier_renamed
      return unless memoized_changes['identifier']

      OpenProject::Notifications.send('project_renamed', project: model)
    end

    def send_update_notification
      OpenProject::Notifications.send('project_updated', project: model)
    end

    def only_custom_values_updated?
      !model.saved_changes? && model.custom_values.any?(&:saved_changes?)
    end

    def update_wp_versions_on_parent_change
      return unless memoized_changes['parent_id']

      WorkPackage.update_versions_from_hierarchy_change(model)
    end
  end
end
